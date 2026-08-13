import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  generateAgeIdentity,
  initializeOpenBot,
  loadDeploymentConfiguration,
  processCommandRunner,
  setEncryptedSecret,
  SANDBOX_SOPS_AGE_KEY,
  type InitializationCommandRunner,
  type InitializationPrompts,
  unsetEncryptedSecret,
} from "./initialization.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("OpenBot initialization", () => {
  it("generates valid-looking age identities", () => {
    const identity = generateAgeIdentity();
    expect(identity.recipient).toMatch(/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/);
    expect(identity.identity).toMatch(/^AGE-SECRET-KEY-1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{58}$/);
  });

  it.skipIf(spawnSync("sops", ["--version"]).error || spawnSync("mkfifo", ["--version"]).error)(
    "generates age identities accepted by SOPS",
    async () => {
      const identity = generateAgeIdentity();
      const encrypted = await processCommandRunner.runWithInputFile!(
        "sops",
        ["encrypt", "--age", identity.recipient, "--input-type", "json", "--output-type", "json"],
        { input: '{"proof":"ok"}' },
      );
      const decrypted = await processCommandRunner.runWithInputFile!(
        "sops",
        ["decrypt", "--input-type", "json", "--output-type", "json"],
        {
          input: encrypted.stdout,
          environment: { ...process.env, SOPS_AGE_KEY: identity.identity },
        },
      );
      expect(JSON.parse(decrypted.stdout)).toEqual({ proof: "ok" });
    },
  );

  it.skipIf(spawnSync("sops", ["--version"]).error || spawnSync("mkfifo", ["--version"]).error)(
    "round-trips an initialized configuration through its owner identity",
    async () => {
      const repositoryRoot = await temporaryRepository();
      let ownerIdentity = "";
      const runner: InitializationCommandRunner = {
        async run(command, args, options) {
          if (command === "op" && args.includes("template"))
            return {
              stdout: JSON.stringify({ fields: [{ id: "password", value: "" }] }),
              stderr: "",
            };
          if (command === "op" && args.includes("create")) {
            const item = JSON.parse(options?.input ?? "{}") as {
              fields?: { id?: string; value?: string }[];
            };
            ownerIdentity = item.fields?.find((field) => field.id === "password")?.value ?? "";
            return { stdout: "", stderr: "" };
          }
          if (command === "op" && args.includes("read"))
            return { stdout: ownerIdentity, stderr: "" };
          return processCommandRunner.run(command, args, options);
        },
        runWithInputFile: processCommandRunner.runWithInputFile,
      };
      const selections = ["onepassword", "local"];
      const inputs = ["Engineering", "OpenBot owner identity", "ghcr.io/example/openbot-computer"];
      await initializeOpenBot({
        repositoryRoot,
        runner,
        prompts: {
          select: async () => selections.shift()!,
          input: async () => inputs.shift() ?? "",
        },
      });

      const loaded = await loadDeploymentConfiguration(repositoryRoot, {
        runner,
        environment: { ...process.env },
      });
      expect(loaded.inputs.sandboxSecrets?.[SANDBOX_SOPS_AGE_KEY]).toMatch(/^AGE-SECRET-KEY-1/);
      const configuration = await readFile(join(repositoryRoot, "configuration/index.ts"), "utf8");
      expect(configuration).toContain("providers: {");
      expect(configuration).toContain("controlService: new LocalControlServiceProvider()");
      expect(configuration).toContain("agent: runtimeProviders.agent");
      const runtimeProviders = await readFile(
        join(repositoryRoot, "configuration/runtime-providers.ts"),
        "utf8",
      );
      expect(runtimeProviders).toContain("agent: new TildeAgentProvider(tilde)");
      expect(runtimeProviders).toContain("inferenceModel: new OpenAIApiKeyInferenceModelProvider");
      expect(
        await readFile(join(repositoryRoot, "configuration/agents/hello-world/agent.ts"), "utf8"),
      ).toContain("export default chatKitEndpoint");
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/instructions.ts"),
          "utf8",
        ),
      ).toContain("export default");
      await expect(
        access(join(repositoryRoot, "configuration/agents/hello-world/tools/hello-world.ts")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      const bashTool = await readFile(
        join(repositoryRoot, "configuration/agents/hello-world/tools/bash.ts"),
        "utf8",
      );
      expect(bashTool).toContain("createBashTool");
      expect(bashTool).toContain('agentId: "hello-world"');
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/tools/read_file.ts"),
          "utf8",
        ),
      ).toContain("createReadFileTool");
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/tools/write_file.ts"),
          "utf8",
        ),
      ).toContain("createWriteFileTool");
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/tools/glob.ts"),
          "utf8",
        ),
      ).toContain("createGlobTool");
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/tools/grep.ts"),
          "utf8",
        ),
      ).toContain("createGrepTool");
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/skills/hello-world/SKILL.md"),
          "utf8",
        ),
      ).toContain("name: hello-world");
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/skills/create-agent/SKILL.md"),
          "utf8",
        ),
      ).toContain("pnpm openbot new-agent");
      expect(
        await readFile(
          join(repositoryRoot, "configuration/agents/hello-world/sandbox/workspace/.profile"),
          "utf8",
        ),
      ).toContain("$HOME/.bashrc");
      expect(
        await readFile(join(repositoryRoot, "configuration/instrumentation.ts"), "utf8"),
      ).toContain("defineInstrumentation");
      await expect(access(join(repositoryRoot, "configuration/skills"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(access(join(repositoryRoot, "configuration/sandbox"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(loaded.environment.SOPS_AGE_KEY).toBeUndefined();
    },
  );

  it("stores the owner identity in 1Password and encrypts the sandbox identity", async () => {
    const repositoryRoot = await temporaryRepository();
    const answers = ["onepassword", "vercel"];
    const inputs = [
      "Engineering",
      "OpenBot owner identity",
      "vercel-secret",
      "openbot-control",
      "openbot-agents",
      "ghcr.io/example/openbot-computer",
    ];
    const prompts: InitializationPrompts = {
      select: vi.fn(async () => answers.shift()!),
      input: vi.fn(async () => inputs.shift() ?? ""),
    };
    const calls: { command: string; args: readonly string[]; input?: string }[] = [];
    const runner: InitializationCommandRunner = {
      run: vi.fn(async (command, args, options) => {
        calls.push({ command, args, input: options?.input });
        if (command === "op" && args.includes("template"))
          return {
            stdout: JSON.stringify({ fields: [{ id: "password", value: "" }] }),
            stderr: "",
          };
        if (command === "sops") return { stdout: '{"sops":{"mac":"encrypted"}}\n', stderr: "" };
        return { stdout: "", stderr: "" };
      }),
    };

    await initializeOpenBot({ repositoryRoot, prompts, runner });

    const environment = await readFile(join(repositoryRoot, "configuration/.env"), "utf8");
    expect(environment).not.toContain("OPENBOT_RUNTIME_PROVIDER");
    expect(environment).toContain('OPENBOT_VERCEL_CONTROL_PROJECT="openbot-control"');
    expect(environment).toContain('OPENBOT_VERCEL_AGENT_PROJECT="openbot-agents"');
    expect(environment).toContain(
      'OPENBOT_COMPUTER_IMAGE_REPOSITORY="ghcr.io/example/openbot-computer"',
    );
    expect(environment).not.toContain("vercel-secret");
    const configuration = await readFile(join(repositoryRoot, "configuration/index.ts"), "utf8");
    expect(configuration).toContain("providers: {");
    expect(configuration).toContain("controlService: new VercelControlServiceProvider()");
    const sopsConfig = await readFile(join(repositoryRoot, "configuration/.sops.yaml"), "utf8");
    expect(sopsConfig.match(/- age1/g)).toHaveLength(2);
    const encrypted = await readFile(
      join(repositoryRoot, "configuration/secrets.enc.yaml"),
      "utf8",
    );
    expect(encrypted).not.toContain("AGE-SECRET-KEY");
    expect(encrypted).not.toContain("vercel-secret");
    const metadata = await readFile(
      join(repositoryRoot, "configuration/sops.identity.json"),
      "utf8",
    );
    expect(metadata).toContain("op://Engineering/OpenBot owner identity/password");

    const onePasswordCreate = calls.find(
      (call) => call.command === "op" && call.args.includes("create"),
    );
    expect(onePasswordCreate?.input).toContain("AGE-SECRET-KEY-1");
    expect(onePasswordCreate?.args.join(" ")).not.toContain("AGE-SECRET-KEY");
    const encryption = calls.find((call) => call.command === "sops");
    expect(encryption?.input).toContain("sops_age_key: AGE-SECRET-KEY-1");
    expect(encryption?.input).toContain("deployment_secrets:");
    expect(encryption?.input).toContain("VERCEL_TOKEN: vercel-secret");
    expect(encryption?.input).toContain("OPENBOT_COMPUTER_SERVICE_API_KEY:");
    expect(encryption?.args.join(" ")).not.toContain("vercel-secret");
  });

  it("loads runtime values while keeping the sandbox identity sandbox-scoped", async () => {
    const repositoryRoot = await temporaryRepository();
    await writeFixture(repositoryRoot, "configuration/.env", "OPENAI_MODEL=gpt-test\n");
    await writeFixture(repositoryRoot, "configuration/secrets.enc.yaml", "encrypted\n");
    const runner: InitializationCommandRunner = {
      run: vi.fn(async () => ({
        stdout: JSON.stringify({
          openbot: { sandbox: { sops_age_key: "AGE-SECRET-KEY-1TEST" } },
          deployment_secrets: { VERCEL_TOKEN: "deploy-private" },
          secrets: { API_TOKEN: "private" },
        }),
        stderr: "",
      })),
    };

    const loaded = await loadDeploymentConfiguration(repositoryRoot, { runner, environment: {} });

    expect(loaded.environment).toMatchObject({
      OPENAI_MODEL: "gpt-test",
      API_TOKEN: "private",
      VERCEL_TOKEN: "deploy-private",
    });
    expect(loaded.inputs.secrets).toEqual({ API_TOKEN: "private" });
    expect(loaded.inputs.deploymentSecrets).toEqual({ VERCEL_TOKEN: "deploy-private" });
    expect(loaded.inputs.sandboxSecrets).toEqual({
      [SANDBOX_SOPS_AGE_KEY]: "AGE-SECRET-KEY-1TEST",
    });
  });

  it("sets and unsets encrypted secrets without putting values in arguments", async () => {
    const repositoryRoot = await temporaryRepository();
    const calls: { args: readonly string[]; input?: string }[] = [];
    const runner: InitializationCommandRunner = {
      run: vi.fn(async (_command, args, options) => {
        calls.push({ args, input: options?.input });
        return { stdout: args.includes("--help") ? "--value-stdin" : "", stderr: "" };
      }),
    };

    await setEncryptedSecret(repositoryRoot, "VERCEL_TOKEN", "private-value", {
      runner,
      environment: { SOPS_AGE_KEY: "owner" },
    });
    await unsetEncryptedSecret(repositoryRoot, "VERCEL_TOKEN", {
      runner,
      environment: { SOPS_AGE_KEY: "owner" },
    });

    const set = calls.find(
      (call) => call.args.includes("set") && call.args.includes("--value-stdin"),
    );
    expect(set?.input).toBe('"private-value"');
    expect(set?.args.join(" ")).not.toContain("private-value");
    expect(calls.some((call) => call.args.includes("unset"))).toBe(true);
  });
});

async function temporaryRepository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "openbot-init-"));
  temporaryDirectories.push(path);
  await writeFixture(path, "configuration/.keep", "");
  return path;
}

async function writeFixture(root: string, relativePath: string, contents: string): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
