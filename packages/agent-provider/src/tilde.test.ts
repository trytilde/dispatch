import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeploymentOutputs } from "@tryopenbot/runtime-provider";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TildeAgentProvider } from "./tilde.js";

const config = {
  apiKey: "secret",
  orgId: "org-one",
  teamId: "team-one",
  baseUrl: "https://tilde.test",
};
const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("TildeAgentProvider", () => {
  it("depends on the shared Tilde setup", () => {
    expect(new TildeAgentProvider(config).platforms.map(({ id }) => id)).toEqual(["tilde"]);
  });

  it("idempotently reconciles the Vercel AI SDK endpoint and enables dev tunneling", async () => {
    const root = await authoredAgent("scout");
    let created = false;
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request.clone());
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path.endsWith("/agents/scout")) {
        if (!created) return Response.json({ status: 404, message: "missing" }, { status: 404 });
        return Response.json(agent());
      }
      if (request.method === "POST" && path.endsWith("/agents/http-vercel-ai-sdk")) {
        created = true;
        const body = await request.json();
        expect(body).toMatchObject({
          id: "scout",
          endpoint_url: "/api/agents/scout",
          local_running_endpoint: true,
        });
        return Response.json({
          agent: agent(),
          api_key: "agent-api-key",
          webhook_signing_key: "signing-key",
        });
      }
      if (request.method === "PATCH" && path.endsWith("/agents/scout"))
        return Response.json(agent());
      if (request.method === "PATCH" && path.endsWith("/agents/scout/status"))
        return Response.json(agent());
      throw new Error(`Unexpected request: ${request.method} ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TildeAgentProvider(config);
    const inputs = new DeploymentOutputs();
    inputs.merge({ outputs: { "agent-service.origin": "http://127.0.0.1:4100" } });
    const context = {
      target: "development" as const,
      repositoryRoot: root,
      environment: {},
      inputs,
      report: () => undefined,
    };
    const first = await provider.deployable.deploy(context);
    expect(first).toMatchObject({
      environmentVariables: {
        AGENT_SCOUT_AGENT_ID: "scout",
        AGENT_SCOUT_PROVIDER_ID: "chatkit.http-vercel-ai-sdk",
      },
      secrets: {
        AGENT_SCOUT_API_KEY: "agent-api-key",
        AGENT_SCOUT_WEBHOOK_SIGNING_KEY: "signing-key",
      },
    });
    Object.assign(context.environment, first?.environmentVariables, first?.secrets);
    await provider.deployable.deploy(context);

    expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect("registerAgent" in provider).toBe(false);
    expect("unregisterAgent" in provider).toBe(false);
  });

  it("clears the endpoint before deleting a stale managed agent", async () => {
    const root = await emptyAgentsRoot();
    const operations: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      operations.push(`${request.method} ${path}`);
      if (request.method === "GET") return Response.json({ ...agent(), id: "retired" });
      if (request.method === "PATCH" && path.endsWith("/agents/retired")) {
        expect(await request.json()).toMatchObject({
          endpoint_url: null,
          local_running_endpoint: false,
        });
        return Response.json({ ...agent(), id: "retired" });
      }
      if (request.method === "PATCH" && path.endsWith("/agents/retired/status"))
        return Response.json({ ...agent(), id: "retired", status: "disabled" });
      if (request.method === "DELETE") return Response.json({ deleted: true });
      throw new Error(`Unexpected request: ${request.method} ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new TildeAgentProvider(config);
    const inputs = new DeploymentOutputs();
    inputs.merge({ outputs: { "agent-service.origin": "https://agents.test" } });

    const result = await provider.deployable.deploy({
      target: "production",
      repositoryRoot: root,
      environment: {
        AGENT_RETIRED_AGENT_ID: "retired",
        AGENT_RETIRED_PROVIDER_ID: "chatkit.http-vercel-ai-sdk",
        AGENT_RETIRED_API_KEY: "old-api-key",
        AGENT_RETIRED_WEBHOOK_SIGNING_KEY: "old-webhook-key",
      },
      inputs,
      report: () => undefined,
    });

    expect(operations).toEqual([
      expect.stringMatching(/^GET .*\/agents\/retired$/),
      expect.stringMatching(/^PATCH .*\/agents\/retired$/),
      expect.stringMatching(/^PATCH .*\/agents\/retired\/status$/),
      expect.stringMatching(/^DELETE .*\/agents\/retired$/),
    ]);
    expect(result).toMatchObject({
      environmentVariableRemovals: ["AGENT_RETIRED_AGENT_ID", "AGENT_RETIRED_PROVIDER_ID"],
      secretRemovals: ["AGENT_RETIRED_API_KEY", "AGENT_RETIRED_WEBHOOK_SIGNING_KEY"],
    });
  });
});

async function authoredAgent(slug: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openbot-agent-provider-"));
  temporaryRoots.push(root);
  const directory = join(root, "configuration", "agents", slug);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "agent.ts"), "export default {}\n");
  return root;
}

async function emptyAgentsRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openbot-agent-provider-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "configuration", "agents"), { recursive: true });
  return root;
}

function agent() {
  return {
    id: "scout",
    provider_id: "chatkit.http-vercel-ai-sdk",
    configuration: {},
    status: "enabled",
  };
}
