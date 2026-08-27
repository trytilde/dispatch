import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeploymentOutputs, type DeploymentContext } from "@tryopenbot/runtime-provider";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TildeAgentProvider } from "./index.js";

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

  it("idempotently reconciles one agent and persists its credentials", async () => {
    const context = await agentContext("scout");
    const requests: Request[] = [];
    const credentialAvailability: boolean[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push(request.clone());
        const path = new URL(request.url).pathname;
        if (request.method === "PUT" && path.endsWith("/openbot/agents/scout/bundle")) {
          const body = (await request.json()) as Record<string, unknown>;
          credentialAvailability.push(body.endpoint_credentials_available === true);
          expect(body).toMatchObject({
            display_name: "Scout",
            endpoint_url: "http://127.0.0.1:4100/api/agents/scout",
            local_running_endpoint: true,
            mcp_server_id: "openbot-scout",
          });
          return Response.json(bundleResponse());
        }
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );
    const provider = new TildeAgentProvider(config);

    await provider.deployable.deploy(context);
    await provider.deployable.deploy(context);

    expect(context.environment).toMatchObject({
      AGENT_SCOUT_AGENT_ID: "scout",
      AGENT_SCOUT_PROVIDER_ID: "chatkit.http-vercel-ai-sdk",
      AGENT_SCOUT_API_KEY: "agent-api-key",
      AGENT_SCOUT_WEBHOOK_SIGNING_KEY: "signing-key",
      AGENT_SCOUT_SKILL_REGISTRY_ID: "registry-one",
      AGENT_SCOUT_MCP_SERVER_ID: "openbot-scout",
    });
    expect(requests.filter((request) => request.method === "PUT")).toHaveLength(2);
    expect(credentialAvailability).toEqual([false, true]);
  });

  it("repairs an existing agent that is not configured to queue turns", async () => {
    const context = await agentContext("scout");
    context.environment.AGENT_SCOUT_API_KEY = "existing-key";
    context.environment.AGENT_SCOUT_WEBHOOK_SIGNING_KEY = "existing-signing-key";
    const updates: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "PUT" && path.endsWith("/openbot/agents/scout/bundle")) {
          updates.push((await request.json()) as Record<string, unknown>);
          return Response.json(bundleResponse({ api_key: null, webhook_signing_key: null }));
        }
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );

    await new TildeAgentProvider(config).deployable.deploy(context);

    expect(updates).toEqual([
      expect.objectContaining({
        display_name: "Scout",
        endpoint_credentials_available: true,
      }),
    ]);
  });

  it("reports the Tilde operation, agent, API detail, and HTTP status", async () => {
    const context = await agentContext("scout");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: "organization does not own this team" }, { status: 403 }),
      ),
    );

    await expect(new TildeAgentProvider(config).deployable.deploy(context)).rejects.toThrow(
      "Unable to reconcile OpenBot agent bundle: organization does not own this team (HTTP 403)",
    );
  });
});

async function agentContext(slug: string): Promise<DeploymentContext> {
  const root = await mkdtemp(join(tmpdir(), "openbot-agent-provider-"));
  temporaryRoots.push(root);
  const directory = join(root, "configuration", "agents", slug);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "agent.ts"), "export default {}\n");
  return {
    devMode: true,
    repositoryRoot: root,
    environment: { AGENT_SCOUT_NAME: "Scout" },
    inputs: new DeploymentOutputs(),
    agentId: slug,
    agentPath: directory,
    agentServiceOrigin: "http://127.0.0.1:4100",
    report: () => undefined,
  };
}

function agent(concurrencyPolicy = "queue") {
  return {
    id: "scout",
    provider_id: "chatkit.http-vercel-ai-sdk",
    display_name: "Scout",
    configuration: {
      endpoint_url: "http://127.0.0.1:4100/api/agents/scout",
      local_running_endpoint: true,
      streaming: true,
      timeout_ms: 300_000,
      concurrency_policy: concurrencyPolicy,
    },
    status: "enabled",
  };
}

function bundleResponse(overrides: Record<string, unknown> = {}) {
  return {
    agent: agent(),
    api_key: "agent-api-key",
    webhook_signing_key: "signing-key",
    channel: { id: "openbot-chatkit-workspace-scout" },
    skill_registry: { id: "registry-one" },
    mcp_server: { id: "openbot-scout" },
    ...overrides,
  };
}
