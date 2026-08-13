import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentProviderError, type AgentProvider } from "@openbot/agent-provider";
import { DeploymentOutputs, type DeploymentContext } from "@openbot/runtime-provider";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { configureAgentRegistrations, parseOptions, redact } from "./deploy.js";

const temporaryRoots: string[] = [];
afterEach(async () =>
  Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

describe("deploy-prod", () => {
  it("parses the minimal deployment options", () => {
    expect(parseOptions(["--", "--yes", "--json"])).toEqual({
      yes: true,
      dryRun: false,
      json: true,
      skipDeploy: false,
      service: "all",
    });
    expect(parseOptions(["--dry-run"])).toEqual({
      yes: false,
      dryRun: true,
      json: false,
      skipDeploy: false,
      service: "all",
    });
    expect(parseOptions(["--skip-deploy", "--service", "agents"])).toEqual({
      yes: false,
      dryRun: false,
      json: false,
      skipDeploy: true,
      service: "agents",
    });
    expect(() => parseOptions(["--service", "unknown"])).toThrow("Unsupported deploy service");
    expect(() => parseOptions(["--resume"])).toThrow("unknown or unexpected option: --resume");
  });

  it("redacts the Vercel token", () => {
    expect(redact("VERCEL_TOKEN=secret-value", ["secret-value"])).toBe("VERCEL_TOKEN=[REDACTED]");
  });

  it("registers missing configured agents and persists issued credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "openbot-deploy-registration-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "configuration/agents/hello-world/tools"), { recursive: true });
    await writeFile(
      join(root, "configuration/agents/hello-world/agent.ts"),
      "export default async function endpoint() { return new Response('ok') }\n",
    );
    for (const name of [
      "await_shell.ts",
      "bash.ts",
      "copy_from_computer.ts",
      "copy_to_computer.ts",
      "glob.ts",
      "grep.ts",
      "read_file.ts",
      "screenshot.ts",
      "write_file.ts",
    ]) {
      await writeFile(
        join(root, `configuration/agents/hello-world/tools/${name}`),
        "export default {}\n",
      );
    }
    const getAgent = vi.fn(async () => {
      throw new AgentProviderError("not_found", "missing");
    });
    const registerAgent = vi.fn(async (request) => ({
      agent: {
        id: "hello-world",
        displayName: request.displayName,
        providerId: "provider",
        status: "enabled",
        hasUiEndpoint: true,
        endpointUrl: request.endpointUrl.href,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      credentials: { apiKey: "agent-api-key-value", webhookSigningKey: "agent-webhook-key-value" },
    }));
    const persistSecret = vi.fn(async () => undefined);
    const inputs = new DeploymentOutputs();
    inputs.merge({ outputs: { "agent-service.origin": "https://agents.example.test" } });
    const context: DeploymentContext = {
      target: "production",
      repositoryRoot: root,
      environment: {},
      inputs,
      report: () => undefined,
    };

    const result = await configureAgentRegistrations(
      { getAgent, registerAgent } as unknown as AgentProvider,
      context,
      persistSecret,
    );

    expect(registerAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hello-world",
        endpointUrl: new URL("https://agents.example.test/api/agents/hello-world"),
      }),
      expect.anything(),
    );
    expect(persistSecret.mock.calls).toEqual([
      ["OPENBOT_AGENT_HELLO_WORLD_API_KEY", "agent-api-key-value"],
      ["OPENBOT_AGENT_HELLO_WORLD_WEBHOOK_SIGNING_KEY", "agent-webhook-key-value"],
    ]);
    expect(result).toEqual({
      secrets: {
        OPENBOT_AGENT_HELLO_WORLD_API_KEY: "agent-api-key-value",
        OPENBOT_AGENT_HELLO_WORLD_WEBHOOK_SIGNING_KEY: "agent-webhook-key-value",
      },
    });
  });
});
