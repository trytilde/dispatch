import { generateKeyPairSync, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseDotenv } from "dotenv";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { LocalAgentServiceProvider, VercelAgentServiceProvider } from "@openbot/agent-service-provider";
import type { OpenBotConfiguration } from "@openbot/configuration";
import { MicrosandboxComputerProvider, VercelSandboxComputerProvider } from "@openbot/computer-provider";
import { LocalControlServiceProvider, VercelControlServiceProvider } from "@openbot/control-service-provider";
import { materializeFileTemplate, renderFileTemplatePath } from "@openbot/utilities";
import type { DeploymentResult, InitializableProvider, ProviderInitializationQuestion } from "@openbot/runtime-provider";

export const SANDBOX_SOPS_AGE_KEY = "SOPS_AGE_KEY";

const configurationAssets = {
  local: fileURLToPath(new URL("./assets/configuration/local.ts.hbs", import.meta.url)),
  vercel: fileURLToPath(new URL("./assets/configuration/vercel.ts.hbs", import.meta.url)),
} as const;
const fileTemplates = {
  document: fileURLToPath(new URL("./assets/files/document.hbs", import.meta.url)),
  empty: fileURLToPath(new URL("./assets/files/empty.hbs", import.meta.url)),
  environmentEntry: fileURLToPath(new URL("./assets/files/environment-entry.hbs", import.meta.url)),
} as const;
const defaultAgentTemplates = [
  ["instrumentation.ts", "./assets/agents/instrumentation.ts.hbs"],
  ["agents/hello-world/agent.ts", "./assets/agents/hello-world/agent.ts.hbs"],
  ["agents/hello-world/instructions.ts", "./assets/agents/hello-world/instructions.ts.hbs"],
  ["agents/hello-world/instrumentation.ts", "./assets/agents/hello-world/instrumentation.ts.hbs"],
  ["agents/hello-world/lib/greeting.ts", "./assets/agents/hello-world/lib/greeting.ts.hbs"],
  ["agents/hello-world/tools/hello-world.ts", "./assets/agents/hello-world/tools/hello-world.ts.hbs"],
  ["agents/hello-world/skills/hello-world/SKILL.md", "./assets/agents/hello-world/skills/hello-world/SKILL.md.hbs"],
  ["agents/hello-world/sandbox/workspace/README.md", "./assets/agents/hello-world/sandbox/workspace/README.md.hbs"],
] as const;

export interface SelectChoice {
  value: string;
  label: string;
  description?: string;
}

export interface InitializationPrompts {
  select(prompt: string, choices: readonly SelectChoice[]): Promise<string>;
  input(prompt: string, options?: { secret?: boolean; required?: boolean }): Promise<string>;
}

export interface CommandResult { stdout: string; stderr: string }

export interface InitializationCommandRunner {
  run(command: string, args: readonly string[], options?: { cwd?: string; environment?: NodeJS.ProcessEnv; input?: string }): Promise<CommandResult>;
  runWithInputFile?(command: string, args: readonly string[], options: { cwd?: string; environment?: NodeJS.ProcessEnv; input: string }): Promise<CommandResult>;
}

export interface InitializationOptions {
  repositoryRoot: string;
  prompts: InitializationPrompts;
  runner?: InitializationCommandRunner;
  platform?: NodeJS.Platform;
}

interface AgeIdentity { recipient: string; identity: string }

type SopsCreationRule = Record<string, string | readonly string[]>;

interface StoredIdentityMetadata {
  version: 1;
  ownerIdentity?:
    | { kind: "onepassword"; reference: string }
    | { kind: "native-keychain"; platform: "darwin" | "linux" };
}

interface OwnerIdentity {
  creationRule: SopsCreationRule;
  metadata?: StoredIdentityMetadata["ownerIdentity"];
}

const identityChoices: readonly SelectChoice[] = [
  { value: "vault-transit", label: "HashiCorp Vault Transit", description: "Use an existing Vault Transit encryption key." },
  { value: "azure-key-vault", label: "Azure Key Vault", description: "Use an Azure Key Vault key as the owner identity." },
  { value: "gcp-kms", label: "Google Cloud KMS", description: "Use Google Cloud IAM to control owner access." },
  { value: "aws-kms", label: "Amazon AWS KMS", description: "Use AWS IAM to control owner access." },
  { value: "onepassword", label: "1Password", description: "Generate an owner age identity and keep it in 1Password." },
  { value: "native-age", label: "Native keychain", description: "Generate an owner age identity and keep it in this computer's keychain." },
];

export async function initializeOpenBot(options: InitializationOptions): Promise<void> {
  const runner = options.runner ?? processCommandRunner;
  const configurationDirectory = resolve(options.repositoryRoot, "configuration");
  const environmentPath = resolve(configurationDirectory, ".env");
  const sopsConfigPath = resolve(configurationDirectory, ".sops.yaml");
  const secretsPath = resolve(configurationDirectory, "secrets.enc.yaml");
  const identityPath = resolve(configurationDirectory, "sops.identity.json");
  const configurationPath = resolve(configurationDirectory, "index.ts");

  await mkdir(configurationDirectory, { recursive: true, mode: 0o700 });
  await createBlankEnvironment(environmentPath);
  if (await exists(secretsPath)) throw new Error("OpenBot configuration is already initialized");
  if (await exists(sopsConfigPath) || await exists(identityPath)) throw new Error("OpenBot has an incomplete SOPS configuration; preserve or remove it before retrying init");

  const sandboxIdentity = generateAgeIdentity();
  const ownerKind = await options.prompts.select("How should owners decrypt OpenBot secrets?", identityChoices);
  const owner = await configureOwnerIdentity(ownerKind, options, runner);

  const selectedProviders = await initializationProviders(configurationPath, options.prompts);
  const initializations = selectedProviders.flatMap((provider) => provider.initialization ? [provider.initialization] : []);

  const environmentValues: Record<string, string> = {};
  const secretValues: Record<string, string> = {};
  const deploymentSecretValues: Record<string, string> = {};
  for (const question of initializations.flatMap((initialization) => initialization.questions)) {
    const value = await askProviderQuestion(options.prompts, question);
    if (!value) continue;
    if (question.destination.kind === "secret") secretValues[question.destination.key] = value;
    else if (question.destination.kind === "deployment-secret") deploymentSecretValues[question.destination.key] = value;
    else environmentValues[question.destination.key] = value;
  }
  secretValues.OPENBOT_COMPUTER_CAPABILITY_SECRET ??= randomBytes(32).toString("base64url");

  const ownerAge = owner.creationRule.age;
  const creationRule: SopsCreationRule = {
    ...owner.creationRule,
    path_regex: "configuration/secrets\\.enc\\.yaml$",
    age: [sandboxIdentity.recipient, ...(Array.isArray(ownerAge) ? ownerAge : [])],
  };
  const plaintext = stringifyYaml({
    openbot: { sandbox: { sops_age_key: sandboxIdentity.identity } },
    deployment_secrets: deploymentSecretValues,
    secrets: secretValues,
  });
  const encryptArguments = ["encrypt",
    ...sopsEncryptionArguments(creationRule),
    "--filename-override", "configuration/secrets.enc.yaml",
    "--input-type", "yaml",
    "--output-type", "yaml",
  ];
  const encrypted = runner.runWithInputFile
    ? await runner.runWithInputFile("sops", encryptArguments, { cwd: options.repositoryRoot, environment: process.env, input: plaintext })
    : await runner.run("sops", encryptArguments, { cwd: options.repositoryRoot, environment: process.env, input: plaintext });
  if (!encrypted.stdout.trim()) throw new Error("SOPS did not return an encrypted configuration");
  const encryptedDocument = parseYaml(encrypted.stdout) as { sops?: unknown } | undefined;
  if (!encryptedDocument?.sops || encrypted.stdout.includes(sandboxIdentity.identity)) throw new Error("SOPS returned an invalid encrypted configuration");

  await writeFileAtomically(sopsConfigPath, await renderDocument(stringifyYaml({ creation_rules: [creationRule] })), 0o600);
  await writeFileAtomically(secretsPath, await renderDocument(encrypted.stdout), 0o600);
  await writeFileAtomically(identityPath, await renderDocument(JSON.stringify({ version: 1, ownerIdentity: owner.metadata } satisfies StoredIdentityMetadata, null, 2)), 0o600);
  await updateEnvironmentFile(environmentPath, environmentValues);
  await scaffoldDefaultAgent(configurationDirectory);
}

export async function loadDeploymentConfiguration(
  repositoryRoot: string,
  options: { runner?: InitializationCommandRunner; environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {},
): Promise<{ environment: NodeJS.ProcessEnv; inputs: DeploymentResult }> {
  const runner = options.runner ?? processCommandRunner;
  const configurationDirectory = resolve(repositoryRoot, "configuration");
  const environmentPath = resolve(configurationDirectory, ".env");
  const secretsPath = resolve(configurationDirectory, "secrets.enc.yaml");
  const staticEnvironment = await readEnvironmentFile(environmentPath);
  if (!await exists(secretsPath)) return {
    environment: { ...(options.environment ?? process.env), ...staticEnvironment },
    inputs: { environmentVariables: staticEnvironment },
  };

  const commandEnvironment = await sopsCommandEnvironment(repositoryRoot, runner, options.environment ?? process.env, options.platform ?? process.platform);
  const decrypted = await runner.run("sops", ["decrypt", "--input-type", "yaml", "--output-type", "yaml", secretsPath], {
    cwd: repositoryRoot,
    environment: commandEnvironment,
  });
  const document = parseYaml(decrypted.stdout) as unknown;
  const parsed = parseSecretsDocument(document);
  const deploymentEnvironment = { ...(options.environment ?? process.env), ...staticEnvironment, ...parsed.secrets, ...parsed.deploymentSecrets };
  delete deploymentEnvironment.SOPS_AGE_KEY;
  delete deploymentEnvironment.SOPS_AGE_KEY_FILE;
  delete deploymentEnvironment.SOPS_AGE_KEY_CMD;
  return {
    environment: deploymentEnvironment,
    inputs: {
      environmentVariables: staticEnvironment,
      secrets: parsed.secrets,
      deploymentSecrets: parsed.deploymentSecrets,
      sandboxSecrets: { [SANDBOX_SOPS_AGE_KEY]: parsed.sandboxAgeIdentity },
    },
  };
}

export async function setEncryptedSecret(
  repositoryRoot: string,
  name: string,
  value: string,
  options: { runner?: InitializationCommandRunner; environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {},
): Promise<void> {
  validateSecretName(name);
  if (!value) throw new Error("Secret value must not be empty");
  const runner = options.runner ?? processCommandRunner;
  const help = await runner.run("sops", ["set", "--help"], { cwd: repositoryRoot, environment: options.environment ?? process.env });
  if (!help.stdout.includes("--value-stdin") && !help.stderr.includes("--value-stdin")) {
    throw new Error("The installed SOPS does not support secure stdin values; install a current SOPS release");
  }
  const environment = await sopsCommandEnvironment(repositoryRoot, runner, options.environment ?? process.env, options.platform ?? process.platform);
  await runner.run("sops", [
    "set", "--value-stdin", resolve(repositoryRoot, "configuration/secrets.enc.yaml"), `["secrets"][${JSON.stringify(name)}]`,
  ], { cwd: repositoryRoot, environment, input: JSON.stringify(value) });
}

export async function unsetEncryptedSecret(
  repositoryRoot: string,
  name: string,
  options: { runner?: InitializationCommandRunner; environment?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {},
): Promise<void> {
  validateSecretName(name);
  const runner = options.runner ?? processCommandRunner;
  const environment = await sopsCommandEnvironment(repositoryRoot, runner, options.environment ?? process.env, options.platform ?? process.platform);
  await runner.run("sops", [
    "unset", resolve(repositoryRoot, "configuration/secrets.enc.yaml"), `["secrets"][${JSON.stringify(name)}]`,
  ], { cwd: repositoryRoot, environment });
}

export function generateAgeIdentity(): AgeIdentity {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const publicJwk = publicKey.export({ format: "jwk" });
  if (!privateJwk.d || !publicJwk.x) throw new Error("Node.js did not generate a complete X25519 key pair");
  return {
    recipient: bech32Encode("age", Buffer.from(publicJwk.x, "base64url")),
    identity: bech32Encode("age-secret-key-", Buffer.from(privateJwk.d, "base64url")).toUpperCase(),
  };
}

async function configureOwnerIdentity(
  kind: string,
  options: InitializationOptions,
  runner: InitializationCommandRunner,
): Promise<OwnerIdentity> {
  switch (kind) {
    case "aws-kms": {
      const arn = await options.prompts.input("AWS KMS key ARN", { required: true });
      const profile = await options.prompts.input("AWS profile (leave blank to use the default credential chain)");
      return { creationRule: { kms: [arn], ...(profile ? { aws_profile: profile } : {}) } };
    }
    case "gcp-kms":
      return { creationRule: { gcp_kms: [await options.prompts.input("Google Cloud KMS resource ID", { required: true })] } };
    case "azure-key-vault":
      return { creationRule: { azure_keyvault: [await options.prompts.input("Azure Key Vault key URL", { required: true })] } };
    case "vault-transit":
      return { creationRule: { hc_vault_transit_uri: [await options.prompts.input("Vault Transit key URI", { required: true })] } };
    case "onepassword": {
      const vault = await options.prompts.input("1Password vault", { required: true });
      const title = await options.prompts.input("1Password item title", { required: true });
      const identity = generateAgeIdentity();
      await storeInOnePassword(runner, vault, title, identity.identity, options.repositoryRoot);
      return {
        creationRule: { age: [identity.recipient] },
        metadata: { kind: "onepassword", reference: `op://${vault}/${title}/password` },
      };
    }
    case "native-age": {
      const platform = options.platform ?? process.platform;
      if (platform !== "darwin" && platform !== "linux") throw new Error(`Native keychain age identities are not supported on ${platform}`);
      const identity = generateAgeIdentity();
      await storeInNativeKeychain(runner, platform, identity.identity, options.repositoryRoot);
      return {
        creationRule: { age: [identity.recipient] },
        metadata: { kind: "native-keychain", platform },
      };
    }
    default:
      throw new Error(`Unsupported SOPS owner identity: ${kind}`);
  }
}

async function askProviderQuestion(prompts: InitializationPrompts, question: ProviderInitializationQuestion): Promise<string> {
  if (!/^[a-z][a-z0-9-]*$/.test(question.id)) throw new Error(`Invalid provider initialization question id: ${question.id}`);
  if (!/^[A-Z][A-Z0-9_]*$/.test(question.destination.key)) throw new Error(`Invalid provider initialization destination: ${question.destination.key}`);
  if (question.input === "select" && !question.choices?.length) throw new Error(`Select question ${question.id} must define choices`);
  const value = question.input === "select"
    ? await prompts.select(question.prompt, question.choices ?? [])
    : await prompts.input(question.prompt, { secret: question.input === "secret", required: question.required });
  if (value && question.validation && !new RegExp(question.validation.pattern).test(value)) throw new Error(question.validation.message);
  return value;
}

async function storeInOnePassword(runner: InitializationCommandRunner, vault: string, title: string, identity: string, cwd: string): Promise<void> {
  const templateResult = await runner.run("op", ["item", "template", "get", "Password", "--format", "json"], { cwd });
  const template = JSON.parse(templateResult.stdout) as { title?: string; fields?: { id?: string; value?: string }[] };
  const password = template.fields?.find((field) => field.id === "password");
  if (!password) throw new Error("1Password's Password item template did not contain a password field");
  template.title = title;
  password.value = identity;
  await runner.run("op", ["item", "create", "--vault", vault, "-"], { cwd, input: JSON.stringify(template) });
}

async function storeInNativeKeychain(runner: InitializationCommandRunner, platform: "darwin" | "linux", identity: string, cwd: string): Promise<void> {
  if (platform === "linux") {
    await runner.run("secret-tool", ["store", "--label", "OpenBot SOPS identity", "service", "ai.openbot.sops", "account", "owner"], { cwd, input: identity });
    return;
  }
  await runner.run("/usr/bin/swift", ["-e", macKeychainStoreProgram], { cwd, input: identity });
}

async function loadStoredOwnerIdentity(repositoryRoot: string, runner: InitializationCommandRunner, platform: NodeJS.Platform): Promise<string | undefined> {
  const path = resolve(repositoryRoot, "configuration/sops.identity.json");
  if (!await exists(path)) return undefined;
  const metadata = JSON.parse(await readFile(path, "utf8")) as StoredIdentityMetadata;
  if (!metadata.ownerIdentity) return undefined;
  if (metadata.ownerIdentity.kind === "onepassword") {
    return (await runner.run("op", ["read", "--no-newline", metadata.ownerIdentity.reference], { cwd: repositoryRoot })).stdout.trim();
  }
  if (metadata.ownerIdentity.platform !== platform) throw new Error(`The configured SOPS identity belongs to ${metadata.ownerIdentity.platform}, not ${platform}`);
  if (platform === "linux") {
    return (await runner.run("secret-tool", ["lookup", "service", "ai.openbot.sops", "account", "owner"], { cwd: repositoryRoot })).stdout.trim();
  }
  return (await runner.run("security", ["find-generic-password", "-w", "-s", "ai.openbot.sops", "-a", "owner"], { cwd: repositoryRoot })).stdout.trim();
}

async function sopsCommandEnvironment(
  repositoryRoot: string,
  runner: InitializationCommandRunner,
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<NodeJS.ProcessEnv> {
  const commandEnvironment = { ...environment };
  if (!commandEnvironment.SOPS_AGE_KEY) {
    const ownerIdentity = await loadStoredOwnerIdentity(repositoryRoot, runner, platform);
    if (ownerIdentity) commandEnvironment.SOPS_AGE_KEY = ownerIdentity;
  }
  return commandEnvironment;
}

function validateSecretName(name: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid secret name: ${name}`);
}

function parseSecretsDocument(value: unknown): { sandboxAgeIdentity: string; secrets: Record<string, string>; deploymentSecrets: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid encrypted OpenBot secrets document");
  const root = value as Record<string, unknown>;
  const openbot = root.openbot as Record<string, unknown> | undefined;
  const sandbox = openbot?.sandbox as Record<string, unknown> | undefined;
  if (typeof sandbox?.sops_age_key !== "string" || !sandbox.sops_age_key.startsWith("AGE-SECRET-KEY-1")) {
    throw new Error("Encrypted configuration is missing openbot.sandbox.sops_age_key");
  }
  const secrets = parseSecretMapping(root.secrets, "secret");
  const deploymentSecrets = parseSecretMapping(root.deployment_secrets, "deployment secret");
  return { sandboxAgeIdentity: sandbox.sops_age_key, secrets, deploymentSecrets };
}

function parseSecretMapping(value: unknown, kind: string): Record<string, string> {
  const mapping = value ?? {};
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error(`Encrypted configuration ${kind}s must be a mapping`);
  const result: Record<string, string> = {};
  for (const [name, secret] of Object.entries(mapping as Record<string, unknown>)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof secret !== "string" || !secret) throw new Error(`Invalid encrypted ${kind}: ${name}`);
    result[name] = secret;
  }
  return result;
}

function sopsEncryptionArguments(rule: SopsCreationRule): string[] {
  const flags: Record<string, string> = {
    age: "--age",
    kms: "--kms",
    aws_profile: "--aws-profile",
    gcp_kms: "--gcp-kms",
    azure_keyvault: "--azure-kv",
    hc_vault_transit_uri: "--hc-vault-transit",
  };
  const arguments_: string[] = [];
  for (const [name, value] of Object.entries(rule)) {
    const flag = flags[name];
    if (!flag) continue;
    arguments_.push(flag, typeof value === "string" ? value : value.join(","));
  }
  return arguments_;
}

async function readEnvironmentFile(path: string): Promise<Record<string, string>> {
  try {
    const parsed = parseDotenv(await readFile(path, "utf8"));
    for (const name of Object.keys(parsed)) if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`Invalid configuration environment variable: ${name}`);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function createBlankEnvironment(path: string): Promise<void> {
  try {
    await materializeFileTemplate(fileTemplates.empty, path, {}, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function createConfiguration(path: string, asset: string): Promise<void> {
  try {
    await materializeFileTemplate(asset, path, {}, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function scaffoldDefaultAgent(configurationDirectory: string): Promise<void> {
  for (const [relativePath, asset] of defaultAgentTemplates) {
    await createConfiguration(
      resolve(configurationDirectory, relativePath),
      fileURLToPath(new URL(asset, import.meta.url)),
    );
  }
}

async function initializationProviders(path: string, prompts: InitializationPrompts): Promise<readonly InitializableProvider[]> {
  if (await exists(path)) {
    const module = await import(pathToFileURL(path).href) as { default?: OpenBotConfiguration };
    if (!module.default) throw new Error("configuration/index.ts must export the OpenBot configuration as default");
    return configuredProviders(module.default);
  }
  const runtime = await prompts.select("Where do you want to deploy OpenBot?", [
    { value: "local", label: "Local", description: "Run OpenBot as user services on this computer." },
    { value: "vercel", label: "Vercel", description: "Deploy control and agent services as separate Vercel projects." },
  ]);
  if (runtime === "local") {
    await createConfiguration(path, configurationAssets.local);
    return [new LocalControlServiceProvider(), new LocalAgentServiceProvider(), new MicrosandboxComputerProvider()];
  }
  if (runtime === "vercel") {
    await createConfiguration(path, configurationAssets.vercel);
    return [new VercelControlServiceProvider(), new VercelAgentServiceProvider(), new VercelSandboxComputerProvider()];
  }
  throw new Error(`Unsupported runtime provider: ${runtime}`);
}

function configuredProviders(configuration: OpenBotConfiguration): InitializableProvider[] {
  const providers: Array<InitializableProvider | undefined> = [
    configuration.providers.controlService,
    configuration.providers.agentService,
    configuration.providers.agent,
    configuration.providers.computer,
    configuration.providers.inferenceModel,
    configuration.providers.skills,
    configuration.providers.tools,
  ];
  return providers.filter((provider): provider is InitializableProvider => provider !== undefined);
}

async function updateEnvironmentFile(path: string, values: Readonly<Record<string, string>>): Promise<void> {
  let contents = await readFile(path, "utf8");
  for (const [name, value] of Object.entries(values)) {
    const line = (await renderFileTemplatePath(fileTemplates.environmentEntry, { NAME: name, VALUE: JSON.stringify(value) })).trimEnd();
    const pattern = new RegExp(`^${name}=.*$`, "m");
    contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents}${contents && !contents.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  await writeFileAtomically(path, contents, 0o600);
}

async function renderDocument(contents: string): Promise<string> {
  return renderFileTemplatePath(fileTemplates.document, { CONTENTS: contents.replace(/\n+$/, "") });
}

async function writeFileAtomically(path: string, contents: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode });
  await chmod(temporary, mode);
  await rename(temporary, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const words = convertBits(bytes, 8, 5);
  const values = [...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, index) => (polymod >>> (5 * (5 - index))) & 31);
  return `${hrp}1${[...words, ...checksum].map((value) => alphabet[value]).join("")}`;
}

function convertBits(data: Uint8Array, from: number, to: number): number[] {
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  for (const value of data) {
    accumulator = (accumulator << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.push((accumulator >>> bits) & ((1 << to) - 1));
    }
  }
  if (bits) result.push((accumulator << (to - bits)) & ((1 << to) - 1));
  return result;
}

function hrpExpand(hrp: string): number[] {
  return [...hrp].map((character) => character.charCodeAt(0) >>> 5)
    .concat([0], [...hrp].map((character) => character.charCodeAt(0) & 31));
}

function bech32Polymod(values: readonly number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < generators.length; index += 1) if ((top >>> index) & 1) checksum ^= generators[index]!;
  }
  return checksum;
}

const macKeychainStoreProgram = `
import Foundation
import Security
let data = FileHandle.standardInput.readDataToEndOfFile()
let deleteQuery: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "ai.openbot.sops", kSecAttrAccount as String: "owner"]
SecItemDelete(deleteQuery as CFDictionary)
var addQuery = deleteQuery
addQuery[kSecValueData as String] = data
let status = SecItemAdd(addQuery as CFDictionary, nil)
if status != errSecSuccess { fputs("Keychain error: \\(status)\\n", stderr); exit(1) }
`;

export const processCommandRunner: InitializationCommandRunner = {
  run(command, args, options = {}) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.environment ?? process.env,
        stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      if (options.input !== undefined) child.stdin?.end(options.input);
      child.once("error", reject);
      child.once("exit", (code) => code === 0
        ? resolvePromise({ stdout, stderr })
        : reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`)));
    });
  },
  async runWithInputFile(command, args, options) {
    const directory = await mkdtemp(resolve(tmpdir(), "openbot-sops-"));
    const pipe = resolve(directory, "input");
    try {
      await processCommandRunner.run("mkfifo", [pipe], { cwd: options.cwd, environment: options.environment });
      const processResult = processCommandRunner.run(command, [...args, pipe], { cwd: options.cwd, environment: options.environment });
      await writeFile(pipe, options.input, "utf8");
      return await processResult;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
};
