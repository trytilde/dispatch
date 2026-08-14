import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  generateAgeIdentity,
  initializeOpenBot,
  isInitializedOpenBotRepository,
  loadDeploymentConfiguration,
  processCommandRunner,
  setEncryptedSecret,
  setEnvironmentValue,
  SANDBOX_SOPS_AGE_KEY,
  type InitializationCommandRunner,
  type InitializationPrompts,
  unsetEncryptedSecret,
  unsetEnvironmentValue,
} from "./initialization.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("OpenBot initialization", () => {
  it("rejects initialization outside an OpenBot repository before writing configuration", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "not-openbot-init-"));
    temporaryDirectories.push(repositoryRoot);

    await expect(
      initializeOpenBot({
        repositoryRoot,
        userConfigurationPath: testUserConfigurationPath(repositoryRoot),
        prompts: {
          select: vi.fn(async () => ""),
          input: vi.fn(async () => ""),
        },
      }),
    ).rejects.toThrow("openbot init must run from the root of a cloned OpenBot repository");

    await expect(access(join(repositoryRoot, "configuration"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

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
      const inputs = ["Engineering", "OpenBot owner identity"];
      await initializeOpenBot({
        repositoryRoot,
        userConfigurationPath: testUserConfigurationPath(repositoryRoot),
        runner,
        prompts: {
          select: async () => selections.shift()!,
          input: async () => inputs.shift() ?? "",
        },
      });

      const loaded = await loadDeploymentConfiguration(repositoryRoot, {
        runner,
        environment: { ...process.env },
        userConfigurationPath: testUserConfigurationPath(repositoryRoot),
      });
      expect(loaded.inputs.sandboxSecrets?.[SANDBOX_SOPS_AGE_KEY]).toMatch(/^AGE-SECRET-KEY-1/);
      const configuration = await readFile(join(repositoryRoot, "configuration/index.ts"), "utf8");
      expect(configuration).toContain("providers: {");
      expect(configuration).toContain("controlService: new LocalControlServiceProvider()");
      expect(configuration).toContain("chat: new TildeChatProvider(tilde)");
      expect(configuration).toContain("agent: new TildeAgentProvider(tilde)");
      expect(configuration).not.toContain("inferenceModel");
      expect(configuration).not.toContain("requiredEnvironment");
      await expect(
        access(join(repositoryRoot, "configuration/runtime-providers.ts")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        await readFile(join(repositoryRoot, "configuration/agents/hello-world/agent.ts"), "utf8"),
      ).toContain("export default chatKitEndpoint");
      expect(
        await readFile(join(repositoryRoot, "configuration/agents/hello-world/agent.ts"), "utf8"),
      ).not.toContain("@tryopenbot/agent-provider");
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
      expect(
        await readFile(join(repositoryRoot, "configuration/templates/agent/agent.ts.hbs"), "utf8"),
      ).toContain("AGENT_{{AGENT_ENV_PREFIX}}_API_KEY");
      await expect(access(join(repositoryRoot, "configuration/skills"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(access(join(repositoryRoot, "configuration/sandbox"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(loaded.environment.SOPS_AGE_KEY).toBeUndefined();
      expect(loaded.environment.COMPUTER_IMAGE_REPOSITORY).toBeUndefined();
      await expect(access(join(repositoryRoot, "configuration/.gitignore"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("preserves a fork-owned configuration ignore file and stops before initialization", async () => {
    const repositoryRoot = await temporaryRepository();
    await writeFixture(repositoryRoot, "configuration/.gitignore", "private-cache/\n");

    await expect(
      initializeOpenBot({
        repositoryRoot,
        userConfigurationPath: testUserConfigurationPath(repositoryRoot),
        prompts: {
          select: vi.fn(async () => ""),
          input: vi.fn(async () => ""),
        },
        runner: { run: vi.fn(async () => ({ stdout: "", stderr: "" })) },
      }),
    ).rejects.toThrow("configuration/.gitignore is fork-owned");

    expect(await readFile(join(repositoryRoot, "configuration/.gitignore"), "utf8")).toBe(
      "private-cache/\n",
    );
    await expect(access(join(repositoryRoot, "configuration/.env"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails immediately when the configured SOPS owner cannot encrypt", async () => {
    const repositoryRoot = await temporaryRepository();
    const select = vi.fn(async () => "aws-kms");
    const answers = [
      "arn:aws:kms:eu-west-1:123456789012:key/00000000-0000-0000-0000-000000000000",
      "sso-admin",
    ];
    const input = vi.fn(async () => answers.shift() ?? "");
    const runner: InitializationCommandRunner = {
      run: vi.fn(async (command, args, options) => {
        if (command === "aws") {
          expect(args).toEqual([
            "configure",
            "export-credentials",
            "--profile",
            "sso-admin",
            "--format",
            "process",
          ]);
          return {
            stdout: JSON.stringify({
              Version: 1,
              AccessKeyId: "fresh-access-key",
              SecretAccessKey: "fresh-secret-key",
              SessionToken: "fresh-session-token",
            }),
            stderr: "",
          };
        }
        if (command === "sops") {
          expect(args).not.toContain("--aws-profile");
          expect(options?.environment).toMatchObject({
            AWS_ACCESS_KEY_ID: "fresh-access-key",
            AWS_SECRET_ACCESS_KEY: "fresh-secret-key",
            AWS_SESSION_TOKEN: "fresh-session-token",
          });
          throw new Error("KMS access denied");
        }
        return { stdout: "", stderr: "" };
      }),
    };

    await expect(
      initializeOpenBot({
        repositoryRoot,
        prompts: { select, input },
        runner,
        userConfigurationPath: testUserConfigurationPath(repositoryRoot),
      }),
    ).rejects.toThrow("SOPS encryption test failed: KMS access denied");

    expect(select).toHaveBeenCalledTimes(1);
    expect(input).toHaveBeenCalledTimes(2);
    await expect(
      access(join(repositoryRoot, "configuration/secrets.enc.yaml")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stores the owner identity in 1Password and encrypts the sandbox identity", async () => {
    const repositoryRoot = await temporaryRepository();
    const answers = ["onepassword", "vercel"];
    const inputs = [
      "Engineering",
      "OpenBot owner identity",
      "vercel-secret",
      "",
      "openbot-control",
      "openbot-agents",
      "tilde-secret",
      "tilde-org",
      "tilde-team",
      "",
      "openai-secret",
    ];
    const promptInput = vi.fn(async () => inputs.shift() ?? "");
    const prompts: InitializationPrompts = {
      select: vi.fn(async () => answers.shift()!),
      input: promptInput,
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

    await initializeOpenBot({
      repositoryRoot,
      prompts,
      runner,
      userConfigurationPath: testUserConfigurationPath(repositoryRoot),
    });

    expect(calls.at(-1)).toMatchObject({ command: "vp", args: ["install"] });

    expect(promptInput).toHaveBeenCalledTimes(11);
    const environment = await readFile(join(repositoryRoot, "configuration/.env"), "utf8");
    expect(environment).not.toContain("RUNTIME_PROVIDER");
    expect(environment).toContain('VERCEL_CONTROL_PROJECT="openbot-control"');
    expect(environment).toContain(
      "# Name of the Vercel project that will host the OpenBot control service",
    );
    expect(environment).toContain('VERCEL_AGENT_PROJECT="openbot-agents"');
    expect(environment).toContain('TILDE_ORG_ID="tilde-org"');
    expect(environment).toContain('TILDE_TEAM_ID="tilde-team"');
    expect(environment).not.toContain("TILDE_RUNTIME_MCP_SERVER_ID");
    expect(environment).not.toContain("TILDE_BASE_URL");
    expect(environment).not.toContain("COMPUTER_IMAGE_REPOSITORY");
    expect(environment).not.toContain("vercel-secret");
    const configuration = await readFile(join(repositoryRoot, "configuration/index.ts"), "utf8");
    expect(configuration).toContain("providers: {");
    expect(configuration).toContain(
      "controlService: new VercelControlServiceProvider({ platform: vercel })",
    );
    const sopsConfig = await readFile(join(repositoryRoot, "configuration/.sops.yaml"), "utf8");
    expect(sopsConfig.match(/- age1/g)).toHaveLength(2);
    const encrypted = await readFile(
      join(repositoryRoot, "configuration/secrets.enc.yaml"),
      "utf8",
    );
    expect(encrypted).not.toContain("AGE-SECRET-KEY");
    expect(encrypted).not.toContain("vercel-secret");
    const metadata = await readFile(testUserConfigurationPath(repositoryRoot), "utf8");
    expect(metadata).toContain('"sops"');
    expect(metadata).toContain("op://Engineering/OpenBot owner identity/password");
    await expect(
      access(join(repositoryRoot, "configuration/sops.identity.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const onePasswordCreate = calls.find(
      (call) => call.command === "op" && call.args.includes("create"),
    );
    expect(onePasswordCreate?.input).toContain("AGE-SECRET-KEY-1");
    expect(onePasswordCreate?.args.join(" ")).not.toContain("AGE-SECRET-KEY");
    const encryption = calls.find(
      (call) => call.command === "sops" && call.input?.includes("SECRETS_SOPS_AGE_KEY:"),
    );
    expect(encryption?.input).toContain("SECRETS_SOPS_AGE_KEY:");
    expect(encryption?.input).toContain("description:");
    expect(encryption?.input).toContain("value: AGE-SECRET-KEY-1");
    expect(encryption?.input).toContain("VERCEL_TOKEN:");
    expect(encryption?.input).toContain("value: vercel-secret");
    expect(encryption?.input).toContain("value: tilde-secret");
    expect(encryption?.input).toContain("value: openai-secret");
    expect(encryption?.input).toContain("COMPUTER_SERVICE_API_KEY:");
    expect(encryption?.args).toContain("--encrypted-regex");
    expect(encryption?.args.join(" ")).not.toContain("vercel-secret");
    await expect(access(join(repositoryRoot, "configuration/.gitignore"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("revisits initialized platform config with existing values as defaults", async () => {
    const repositoryRoot = await temporaryRepository();
    const sopsConfiguration = stringifyYaml({
      creation_rules: [
        {
          path_regex: "configuration/secrets\\.enc\\.yaml$",
          encrypted_regex: "^value$",
          age: ["age1owner"],
        },
      ],
    });
    const storedSecrets = {
      EXTRA_SECRET: { description: "Unrelated secret", value: "keep-secret" },
      SECRETS_SOPS_AGE_KEY: {
        description: "Sandbox age identity",
        value: "AGE-SECRET-KEY-1STORED",
      },
    };
    await writeFixture(
      repositoryRoot,
      "configuration/.env",
      'TILDE_ORG_ID="stored-org"\nUNRELATED="keep"\n',
    );
    await writeFixture(repositoryRoot, "configuration/.sops.yaml", sopsConfiguration);
    await writeFixture(repositoryRoot, "configuration/secrets.enc.yaml", "encrypted\n");
    await writeFixture(
      repositoryRoot,
      "user-config.json",
      '{"version":1,"sops":{"ownerIdentity":{"kind":"gcp-kms"}}}\n',
    );
    await writeFixture(
      repositoryRoot,
      "configuration/index.ts",
      `function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(\`${"${name}"} is required\`);
  return value;
}

class TildeAgentProvider {
  configured = requiredEnvironment("TILDE_API_KEY");
}

export default {
  providers: {
    controlService: {},
    agentService: {},
    chat: {},
    agent: new TildeAgentProvider(),
    computer: {},
    skills: {},
    tools: {},
  },
};
`,
    );

    const defaults = new Map<string, string | undefined>();
    let encryptionInput: string | undefined;
    const run = vi.fn(async (command: string, args: readonly string[]) => {
      if (command === "sops" && args[0] === "decrypt")
        return { stdout: stringifyYaml(storedSecrets), stderr: "" };
      if (command === "vp") return { stdout: "", stderr: "" };
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    });
    const runner: InitializationCommandRunner = {
      run,
      runWithInputFile: vi.fn(async (command, args, options) => {
        expect(command).toBe("sops");
        expect(args[0]).toBe("encrypt");
        encryptionInput = options.input;
        const plaintext = parseYaml(options.input) as Record<
          string,
          { description: string; value: string }
        >;
        const encrypted = Object.fromEntries(
          Object.entries(plaintext).map(([name, described]) => [
            name,
            { ...described, value: `ENC[${name}]` },
          ]),
        );
        return { stdout: stringifyYaml({ ...encrypted, sops: { mac: "encrypted" } }), stderr: "" };
      }),
    };
    const prompts: InitializationPrompts = {
      select: vi.fn(async () => {
        throw new Error("No select prompt expected");
      }),
      input: vi.fn(async (_prompt, options) => {
        defaults.set(options?.id ?? "", options?.initialValue);
        if (options?.id === "tilde-api-key") return "entered-tilde";
        if (options?.id === "tilde-team-id") return "entered-team";
        return options?.id === "tilde-org-id" ? "updated-org" : (options?.initialValue ?? "");
      }),
    };

    expect(await isInitializedOpenBotRepository(repositoryRoot)).toBe(true);
    await initializeOpenBot({
      repositoryRoot,
      prompts,
      runner,
      userConfigurationPath: testUserConfigurationPath(repositoryRoot),
    });

    expect(defaults).toEqual(
      new Map([
        ["tilde-api-key", undefined],
        ["tilde-org-id", "stored-org"],
        ["tilde-team-id", undefined],
        ["tilde-base-url", undefined],
        ["openai-api-key", undefined],
      ]),
    );
    const environment = await readFile(join(repositoryRoot, "configuration/.env"), "utf8");
    expect(environment).toContain('TILDE_ORG_ID="updated-org"');
    expect(environment).toContain('TILDE_TEAM_ID="entered-team"');
    expect(environment).toContain('UNRELATED="keep"');
    const reencrypted = parseYaml(encryptionInput ?? "") as typeof storedSecrets;
    expect(reencrypted).toMatchObject({
      TILDE_API_KEY: {
        description: "API key used by OpenBot services to access the selected Tilde team.",
        value: "entered-tilde",
      },
    });
    expect(reencrypted.EXTRA_SECRET).toEqual(storedSecrets.EXTRA_SECRET);
    expect(reencrypted.SECRETS_SOPS_AGE_KEY).toEqual(storedSecrets.SECRETS_SOPS_AGE_KEY);
    expect(await readFile(join(repositoryRoot, "configuration/.sops.yaml"), "utf8")).toBe(
      sopsConfiguration,
    );
    expect(run).toHaveBeenLastCalledWith("vp", ["install"], { cwd: repositoryRoot });
  });

  it("loads runtime values while keeping the sandbox identity sandbox-scoped", async () => {
    const repositoryRoot = await temporaryRepository();
    await writeFixture(repositoryRoot, "configuration/.env", "OPENAI_MODEL=gpt-test\n");
    await writeFixture(repositoryRoot, "configuration/secrets.enc.yaml", "encrypted\n");
    await writeFixture(
      repositoryRoot,
      "user-config.json",
      JSON.stringify({
        version: 1,
        sops: { ownerIdentity: { kind: "aws-profile", profile: "sso-admin" } },
      }),
    );
    const runner: InitializationCommandRunner = {
      run: vi.fn(async (command, args, options) => {
        if (command === "aws") {
          expect(args).toContain("sso-admin");
          return {
            stdout: JSON.stringify({
              Version: 1,
              AccessKeyId: "fresh-access-key",
              SecretAccessKey: "fresh-secret-key",
              SessionToken: "fresh-session-token",
            }),
            stderr: "",
          };
        }
        expect(command).toBe("sops");
        expect(options?.environment).toMatchObject({
          AWS_PROFILE: "sso-admin",
          AWS_ACCESS_KEY_ID: "fresh-access-key",
          AWS_SECRET_ACCESS_KEY: "fresh-secret-key",
          AWS_SESSION_TOKEN: "fresh-session-token",
        });
        return {
          stdout: JSON.stringify({
            SECRETS_SOPS_AGE_KEY: {
              description: "Sandbox age identity",
              value: "AGE-SECRET-KEY-1TEST",
            },
            VERCEL_TOKEN: { description: "Vercel deployment token", value: "deploy-private" },
            API_TOKEN: { description: "Runtime API token", value: "private" },
            COMPUTER_SERVICE_API_KEY: {
              description: "Computer service key",
              value: "computer-private",
            },
          }),
          stderr: "",
        };
      }),
    };

    const loaded = await loadDeploymentConfiguration(repositoryRoot, {
      runner,
      environment: {},
      userConfigurationPath: testUserConfigurationPath(repositoryRoot),
    });

    expect(loaded.environment).toMatchObject({
      OPENAI_MODEL: "gpt-test",
      API_TOKEN: "private",
      VERCEL_TOKEN: "deploy-private",
    });
    expect(loaded.inputs.secrets).toEqual({
      API_TOKEN: "private",
      COMPUTER_SERVICE_API_KEY: "computer-private",
    });
    expect(loaded.inputs.deploymentSecrets).toEqual({ VERCEL_TOKEN: "deploy-private" });
    expect(loaded.inputs.sandboxSecrets).toEqual({
      [SANDBOX_SOPS_AGE_KEY]: "AGE-SECRET-KEY-1TEST",
    });
    expect(JSON.parse(await readFile(testUserConfigurationPath(repositoryRoot), "utf8"))).toEqual({
      version: 1,
      sops: { ownerIdentity: { kind: "aws-profile", profile: "sso-admin" } },
    });
  });

  it("fails safely when SOPS values are missing from user configuration non-interactively", async () => {
    const repositoryRoot = await temporaryRepository();
    await writeFixture(
      repositoryRoot,
      "configuration/.sops.yaml",
      stringifyYaml({ creation_rules: [{ age: ["age1owner"] }] }),
    );
    await writeFixture(repositoryRoot, "configuration/secrets.enc.yaml", "encrypted\n");
    await writeFixture(repositoryRoot, "user-config.json", '{"version":1}\n');
    const runner: InitializationCommandRunner = { run: vi.fn() };

    await expect(
      loadDeploymentConfiguration(repositoryRoot, {
        runner,
        environment: {},
        userConfigurationPath: testUserConfigurationPath(repositoryRoot),
      }),
    ).rejects.toThrow(
      "Run openbot init in an interactive terminal to configure the existing owner identity",
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("recovers missing age lookup metadata interactively without replacing the identity", async () => {
    const repositoryRoot = await temporaryRepository();
    await writeFixture(
      repositoryRoot,
      "configuration/.sops.yaml",
      stringifyYaml({ creation_rules: [{ age: ["age1owner"] }] }),
    );
    await writeFixture(repositoryRoot, "configuration/secrets.enc.yaml", "encrypted\n");
    const runner: InitializationCommandRunner = {
      run: vi.fn(async (command, args, options) => {
        if (command === "op") return { stdout: "AGE-SECRET-KEY-1EXISTING", stderr: "" };
        expect(command).toBe("sops");
        expect(args[0]).toBe("decrypt");
        expect(options?.environment?.SOPS_AGE_KEY).toBe("AGE-SECRET-KEY-1EXISTING");
        return {
          stdout: stringifyYaml({
            SECRETS_SOPS_AGE_KEY: {
              description: "Sandbox age identity",
              value: "AGE-SECRET-KEY-1SANDBOX",
            },
          }),
          stderr: "",
        };
      }),
    };
    const prompts: InitializationPrompts = {
      select: vi.fn(async () => "onepassword"),
      input: vi.fn(async () => "op://Engineering/OpenBot owner identity/password"),
    };

    await loadDeploymentConfiguration(repositoryRoot, {
      runner,
      environment: {},
      prompts,
      userConfigurationPath: testUserConfigurationPath(repositoryRoot),
    });

    expect(JSON.parse(await readFile(testUserConfigurationPath(repositoryRoot), "utf8"))).toEqual({
      version: 1,
      sops: {
        ownerIdentity: {
          kind: "onepassword",
          reference: "op://Engineering/OpenBot owner identity/password",
        },
      },
    });
    expect(prompts.select).toHaveBeenCalledTimes(1);
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
      description: "Vercel deployment credential.",
    });
    await unsetEncryptedSecret(repositoryRoot, "VERCEL_TOKEN", {
      runner,
      environment: { SOPS_AGE_KEY: "owner" },
    });

    const set = calls.find(
      (call) => call.args.includes("set") && call.args.includes("--value-stdin"),
    );
    expect(JSON.parse(set?.input ?? "")).toEqual({
      description: "Vercel deployment credential.",
      value: "private-value",
    });
    expect(set?.args).toContain('["VERCEL_TOKEN"]');
    expect(set?.args.join(" ")).not.toContain("private-value");
    expect(calls.some((call) => call.args.includes("unset"))).toBe(true);
  });

  it("sets and unsets described environment values", async () => {
    const repositoryRoot = await temporaryRepository();
    await writeFixture(
      repositoryRoot,
      "configuration/.env",
      '# Existing description\nEXISTING="old"\nUNRELATED=value\n',
    );

    await setEnvironmentValue(repositoryRoot, "EXISTING", "new", "Updated description.");
    await setEnvironmentValue(repositoryRoot, "NEW", "value", "New description.");
    let environment = await readFile(join(repositoryRoot, "configuration/.env"), "utf8");
    expect(environment).toContain('# Updated description.\nEXISTING="new"');
    expect(environment).toContain('# New description.\nNEW="value"');
    expect(environment).toContain("UNRELATED=value");

    await unsetEnvironmentValue(repositoryRoot, "EXISTING");
    environment = await readFile(join(repositoryRoot, "configuration/.env"), "utf8");
    expect(environment).not.toContain("Updated description");
    expect(environment).not.toContain("EXISTING");
    expect(environment).toContain("UNRELATED=value");
  });
});

async function temporaryRepository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "openbot-init-"));
  temporaryDirectories.push(path);
  await writeFixture(path, "package.json", '{"name":"@tryopenbot/workspace"}\n');
  await writeFixture(path, "pnpm-workspace.yaml", "packages:\n  - cli\n");
  await writeFixture(path, "cli/package.json", '{"name":"openbot"}\n');
  await writeFixture(path, "configuration/.gitignore", "*\n!.gitignore\n");
  return path;
}

function testUserConfigurationPath(repositoryRoot: string): string {
  return join(repositoryRoot, "user-config.json");
}

async function writeFixture(root: string, relativePath: string, contents: string): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
