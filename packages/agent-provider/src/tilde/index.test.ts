import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeploymentOutputs, type DeploymentContext } from "@tryopenbot/runtime-provider";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AgentProviderError, type ReconciledAgent } from "../core.js";
import { TildeAgentProvider } from "./index.js";
import { TildeSkillReconciler } from "./skills.js";
import { TildeToolReconciler } from "./tools.js";

const config = {
  apiKey: "secret",
  orgId: "org-one",
  teamId: "team-one",
  baseUrl: "https://tilde.test",
};
const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("TildeAgentProvider", () => {
  it("depends on the shared Tilde setup", () => {
    expect(new TildeAgentProvider(config).platforms.map(({ id }) => id)).toEqual(["tilde"]);
  });

  it("rejects an unknown automatic-memory mode before provisioning", async () => {
    const context = await agentContext("scout");
    context.environment.OPENBOT_AUTOMATIC_MEMORY_MODE = "surprise";
    await expect(new TildeAgentProvider(config).deployable.deploy(context)).rejects.toThrow(
      "OPENBOT_AUTOMATIC_MEMORY_MODE must be none, personal, personal_plus_agent, or team",
    );
  });

  it("polls through memory-binding synchronization and completes provisioning", async () => {
    vi.spyOn(TildeSkillReconciler.prototype, "bundleSkills").mockResolvedValue({
      custom: [
        {
          key: "configuration/agents/scout/skills/example/SKILL.md",
          name: "scout-example",
          description: "Example",
          content: "# Example",
        },
      ],
      managed: [{ provider_id: "cua", skill_ids: ["gui-automation"] }],
    });
    const external = vi
      .spyOn(TildeToolReconciler.prototype, "deployExternalResources")
      .mockResolvedValue();
    const context = await agentContext("scout");
    context.environment.OPENBOT_PERSONAL_TOOL_FEDERATION_MODE = "all";
    context.environment.OPENBOT_AUTOMATIC_MEMORY_MODE = "team";
    context.environment.AGENT_SCOUT_AUTOMATIC_MEMORY_MODE = "personal_plus_agent";
    const persistedSecrets: string[] = [];
    context.persistence = {
      setEnvironment: async () => undefined,
      setSecret: async (name) => {
        persistedSecrets.push(name);
      },
      unsetEnvironment: async () => undefined,
      unsetSecret: async () => undefined,
    };
    let channelCreated = false;
    let polls = 0;
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push(request.clone());
        const path = new URL(request.url).pathname;
        if (request.method === "PUT" && path.endsWith("/agents/scout/provision")) {
          const body = (await request.json()) as { memory?: { wiki?: unknown } };
          expect(body).toMatchObject({
            agent: {
              automatic_memory_mode: "personal_plus_agent",
              credential_strategy: "rotate",
              endpoint: { concurrency_policy: "queue" },
            },
            mcp_server: {
              enabled: true,
              id: "openbot-scout",
              enable_tilde_control_plane: true,
              user_tool_federation_mode: "all",
              user_tool_federation_selections: [],
            },
            skill_registry: {
              enabled: true,
              enabled_skills: { managed: [{ provider_id: "cua" }] },
            },
            memory: {
              bank: {
                enabled: true,
                name: "OpenBot scout memory",
                synthesizer_agent_id: "memory-catcher",
              },
            },
          });
          expect(body.memory?.wiki).toBeUndefined();
          return Response.json({
            ...operation("error", false),
            error_message: "service unavailable: memory bindings are still synchronizing",
          });
        }
        if (request.method === "GET" && path.endsWith("/agents/scout/provision")) {
          polls += 1;
          if (polls === 1)
            return Response.json({
              ...operation("error", false),
              error_message: "  Memory bindings are still synchronizing  ",
            });
          return Response.json(operation("active", true));
        }
        if (request.method === "POST" && path.endsWith("/provision/outputs/claim"))
          return Response.json({
            values: { api_key: "agent-api-key", webhook_signing_key: "signing-key" },
          });
        if (request.method === "PUT" && path.endsWith("/agents/scout/avatar")) {
          expect(persistedSecrets).toEqual([
            "AGENT_SCOUT_API_KEY",
            "AGENT_SCOUT_WEBHOOK_SIGNING_KEY",
          ]);
          expect(context.environment.AGENT_SCOUT_API_KEY).toBe("agent-api-key");
          expect(request.headers.get("authorization")).toBe("Bearer agent-api-key");
          expect(request.headers.get("content-type")).toBe("image/png");
          const bytes = new Uint8Array(await request.arrayBuffer());
          expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
          return Response.json({
            principal_user_id: "machine-scout",
            avatar: { media_type: "image/png", size_bytes: bytes.length, sha256: "hash" },
          });
        }
        if (request.method === "GET" && path.endsWith("/channels"))
          return Response.json({
            items: channelCreated
              ? [
                  {
                    id: "openbot-chatkit-workspace-scout",
                    configuration: { default_agent_inbox_id: "scout" },
                  },
                ]
              : [],
          });
        if (request.method === "POST" && path.endsWith("/channels/vercel-ui")) {
          channelCreated = true;
          return Response.json({ id: "openbot-chatkit-workspace-scout", status: "enabled" });
        }
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );

    await new TildeAgentProvider(config).deployable.deploy(context);

    expect(polls).toBe(2);
    expect(external).toHaveBeenCalledOnce();
    expect(context.environment).toMatchObject({
      AGENT_SCOUT_API_KEY: "agent-api-key",
      AGENT_SCOUT_WEBHOOK_SIGNING_KEY: "signing-key",
      AGENT_SCOUT_MCP_SERVER_ID: "openbot-scout",
    });
    expect(requests.some((request) => request.url.endsWith("/provision/outputs/claim"))).toBe(true);
    // Without options every agent keeps its own bank, registry, and connectors server and the
    // provider never touches permissions: none of the opt-in calls or variables may appear.
    expect(requests.some((request) => request.url.endsWith("/permissions"))).toBe(false);
    expect(
      requests.some(
        (request) => request.method === "POST" && request.url.endsWith("/mcp/mcp-server"),
      ),
    ).toBe(false);
    expect(context.environment.OPENBOT_SHARED_MEMORY_BANK_ID).toBeUndefined();
    expect(context.environment.OPENBOT_SHARED_SKILL_REGISTRY_ID).toBeUndefined();
    expect(context.environment.OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID).toBeUndefined();
  });

  it("preserves credentials and adopts legacy resource IDs on a repeated deployment", async () => {
    vi.spyOn(TildeSkillReconciler.prototype, "bundleSkills").mockResolvedValue({
      custom: [],
      managed: [],
    });
    vi.spyOn(TildeToolReconciler.prototype, "deployExternalResources").mockResolvedValue();
    const context = await agentContext("scout");
    Object.assign(context.environment, {
      AGENT_SCOUT_API_KEY: "existing-key",
      AGENT_SCOUT_WEBHOOK_SIGNING_KEY: "existing-signing-key",
      AGENT_SCOUT_MCP_SERVER_ID: "legacy-mcp",
      AGENT_SCOUT_SKILL_REGISTRY_ID: "11111111-1111-4111-8111-111111111111",
      AGENT_SCOUT_PROVIDER_ID: "legacy-provider",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "PUT" && path.endsWith("/agents/scout/provision")) {
          const body = (await request.json()) as { memory?: unknown };
          expect(body).toMatchObject({
            agent: { automatic_memory_mode: "none", credential_strategy: "preserve" },
            mcp_server: { id: "legacy-mcp" },
            skill_registry: { id: "11111111-1111-4111-8111-111111111111" },
          });
          expect(body.memory).toEqual({ bank: { enabled: false } });
          return Response.json(operation("active", false, "legacy-mcp"));
        }
        if (request.method === "PUT" && path.endsWith("/agents/scout/avatar")) {
          expect(request.headers.get("authorization")).toBe("Bearer existing-key");
          return Response.json({ principal_user_id: "machine-scout", avatar: {} });
        }
        if (request.method === "GET" && path.endsWith("/channels"))
          return Response.json({
            items: [
              {
                id: "openbot-chatkit-workspace-scout",
                configuration: { default_agent_inbox_id: "scout" },
              },
            ],
          });
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );

    await new TildeAgentProvider(config).deployable.deploy(context);

    expect(context.environment.AGENT_SCOUT_PROVIDER_ID).toBeUndefined();
    expect(context.environment.AGENT_SCOUT_SKILL_REGISTRY_ID).toBeUndefined();
    expect(context.environment.AGENT_SCOUT_MCP_SERVER_ID).toBe("legacy-mcp");
  });

  it("shares one bank, registry, and connectors server when the composition root asks and applies its permissions", async () => {
    vi.spyOn(TildeSkillReconciler.prototype, "bundleSkills").mockImplementation(
      async (context) => ({
        custom: [
          {
            key: `${context.agentPath}/skills/example/SKILL.md`,
            name: `${context.agentId}-example`,
            description: "Example",
            content: "# Example",
          },
        ],
        managed: [{ provider_id: "cua", skill_ids: ["gui-automation"] }],
      }),
    );
    vi.spyOn(TildeToolReconciler.prototype, "deployExternalResources").mockResolvedValue();
    const root = await mkdtemp(join(tmpdir(), "openbot-shared-provider-"));
    temporaryRoots.push(root);
    const primaryDirectory = join(root, "configuration", "agent");
    for (const directory of [
      primaryDirectory,
      join(primaryDirectory, "subagents", "operator"),
      join(primaryDirectory, "subagents", "memory-catcher"),
      join(primaryDirectory, "subagents", "scout"),
    ]) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "agent.ts"), "export default {}\n");
    }
    const environment: Record<string, string | undefined> = {
      OPENBOT_AUTOMATIC_MEMORY_MODE: "personal_plus_agent",
      AGENT_FACTORY_NAME: "Concierge",
      AGENT_FACTORY_API_KEY: "factory-key",
      AGENT_FACTORY_WEBHOOK_SIGNING_KEY: "factory-signing",
      AGENT_OPERATOR_API_KEY: "operator-key",
      AGENT_OPERATOR_WEBHOOK_SIGNING_KEY: "operator-signing",
      AGENT_MEMORY_CATCHER_API_KEY: "catcher-key",
      AGENT_MEMORY_CATCHER_WEBHOOK_SIGNING_KEY: "catcher-signing",
    };
    const context = (agentId: string, kind: "primary" | "subagent"): DeploymentContext => ({
      devMode: true,
      repositoryRoot: root,
      environment,
      inputs: new DeploymentOutputs(),
      agentId,
      agentKind: kind,
      agentPath:
        kind === "primary" ? primaryDirectory : join(primaryDirectory, "subagents", agentId),
      agentServiceOrigin: "http://127.0.0.1:4100",
      report: () => undefined,
    });
    const bundles: Record<string, unknown> = {};
    const agentUpdates: Record<string, unknown> = {};
    const permissions: Record<string, unknown> = {};
    let connectorsServer:
      | { id: string; user_tool_federation_mode: string; is_dynamic_tool_discovery: boolean }
      | undefined;
    let connectorsUpdates = 0;
    let provisionedOwner = "human-owner";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        const agent = /\/agents\/([a-z-]+)/.exec(path)?.[1] ?? "";
        if (path.endsWith("/mcp/mcp-server/openbot-connectors") && request.method === "GET")
          return connectorsServer
            ? Response.json({ ...connectorsServer, name: "Shared connectors", tools: [] })
            : Response.json({ error: "not found" }, { status: 404 });
        if (path.endsWith("/mcp/mcp-server") && request.method === "POST") {
          const body = (await request.json()) as {
            id: string;
            name: string;
            user_tool_federation_mode: string;
          };
          expect(body).toMatchObject({
            id: "openbot-connectors",
            name: "Shared connectors",
            user_tool_federation_mode: "all",
          });
          connectorsServer = {
            id: body.id,
            user_tool_federation_mode: body.user_tool_federation_mode,
            is_dynamic_tool_discovery: true,
          };
          return Response.json({ ...connectorsServer, name: body.name, tools: [] });
        }
        if (path.endsWith("/mcp/mcp-server/openbot-connectors") && request.method === "PATCH") {
          connectorsUpdates += 1;
          return Response.json({ ...connectorsServer, name: "Shared connectors", tools: [] });
        }
        if (request.method === "PUT" && path.endsWith("/provision")) {
          bundles[agent] = await request.json();
          return Response.json({
            ...operation("active", false, `openbot-${agent}`),
            agent_id: agent,
            owner_user_id: provisionedOwner,
            resources: [
              {
                kind: "mcp_server",
                key: "default",
                id: `openbot-${agent}`,
                created_by_operation: true,
              },
              ...(agent === "factory"
                ? [
                    {
                      kind: "memory_bank",
                      key: "default",
                      id: "shared-bank",
                      created_by_operation: true,
                    },
                    {
                      kind: "skill_registry",
                      key: "default",
                      id: "shared-registry",
                      created_by_operation: true,
                    },
                  ]
                : []),
            ],
          });
        }
        if (request.method === "PUT" && path.endsWith("/avatar"))
          return Response.json({ principal_user_id: `machine-${agent}`, avatar: {} });
        if (request.method === "PATCH" && path.endsWith(`/agents/${agent}`)) {
          agentUpdates[agent] = await request.json();
          return Response.json({ id: agent });
        }
        if (request.method === "PUT" && path.endsWith("/permissions")) {
          permissions[agent] = await request.json();
          return Response.json({ agent_id: agent });
        }
        if (request.method === "GET" && path.endsWith("/channels"))
          return Response.json({ items: [] });
        if (request.method === "POST" && path.endsWith("/channels/vercel-ui"))
          return Response.json({ id: "channel", status: "enabled" });
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );
    const resolved: ReconciledAgent[] = [];
    const provider = new TildeAgentProvider(config, {
      sharedResources: {
        memoryBank: { name: "Shared memory", additionalBankIds: ["installation-bank"] },
        skillRegistry: { name: "Shared skills" },
        connectorsMcpServer: { id: "openbot-connectors", name: "Shared connectors" },
      },
      permissions: (agent) => {
        resolved.push(agent);
        if (!agent.ownerUserId)
          throw new AgentProviderError(
            "provider_unavailable",
            `No owner is known for ${agent.id}`,
            true,
          );
        return ownerOnlyPermissions(agent as ReconciledAgent & { ownerUserId: string });
      },
    });

    // A shared bank never picks a memory mode on its own; the installation must turn memory on.
    delete environment.OPENBOT_AUTOMATIC_MEMORY_MODE;
    await expect(provider.deployable.deploy(context("factory", "primary"))).rejects.toThrow(
      "sharedResources.memoryBank requires OPENBOT_AUTOMATIC_MEMORY_MODE",
    );
    environment.OPENBOT_AUTOMATIC_MEMORY_MODE = "personal_plus_agent";

    // A subagent cannot pin shared resources the primary has not created yet.
    await expect(provider.deployable.deploy(context("operator", "subagent"))).rejects.toThrow(
      "The primary agent must reconcile before operator: OPENBOT_SHARED_MEMORY_BANK_ID, OPENBOT_SHARED_SKILL_REGISTRY_ID, OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID are required",
    );

    await provider.deployable.deploy(context("factory", "primary"));
    expect(connectorsServer).toMatchObject({
      id: "openbot-connectors",
      user_tool_federation_mode: "all",
    });
    expect(environment).toMatchObject({
      OPENBOT_SHARED_CONNECTORS_MCP_SERVER_ID: "openbot-connectors",
      OPENBOT_SHARED_MEMORY_BANK_ID: "shared-bank",
      OPENBOT_SHARED_SKILL_REGISTRY_ID: "shared-registry",
    });
    expect(bundles.factory).toMatchObject({
      agent: { display_name: "Concierge", automatic_memory_mode: "personal_plus_agent" },
      mcp_server: { id: "openbot-factory", user_tool_federation_mode: "none" },
      skill_registry: {
        name: "Shared skills",
        enabled_skills: { managed: [{ provider_id: "cua", skill_ids: ["gui-automation"] }] },
      },
      memory: {
        bank: { enabled: true, name: "Shared memory", synthesizer_agent_id: "memory-catcher" },
      },
    });
    const primaryBundle = bundles.factory as {
      skill_registry: { id?: string; enabled_skills: { custom: Array<{ name: string }> } };
    };
    expect(primaryBundle.skill_registry.id).toBeUndefined();
    // The shared registry carries every authored agent's skills, not only the primary's.
    expect(
      primaryBundle.skill_registry.enabled_skills.custom.map(({ name }) => name).toSorted(),
    ).toEqual(["factory-example", "memory-catcher-example", "operator-example", "scout-example"]);
    expect(agentUpdates.factory).toEqual({
      personal_tool_mcp_server_instance_id: "openbot-connectors",
    });
    // Without an explicit override the owner is whoever Tilde recorded on the provisioned bundle.
    expect(resolved.at(-1)).toEqual({
      id: "factory",
      kind: "primary",
      subagentIds: ["operator", "scout"],
      ownerUserId: "human-owner",
    });
    expect(permissions.factory).toEqual({
      create_multiplayer_sessions: {
        with_users: { mode: "only", ids: ["human-owner"] },
        with_agents: { mode: "none" },
      },
      delegate_to_other_agents: { mode: "only", ids: ["operator", "scout"] },
    });

    await provider.deployable.deploy(context("operator", "subagent"));
    expect(bundles.operator).toMatchObject({
      agent: { automatic_memory_mode: "personal_plus_agent" },
      skill_registry: { id: "shared-registry", name: "Shared skills" },
      memory: { bank: { enabled: false } },
    });
    expect(agentUpdates.operator).toEqual({
      personal_tool_mcp_server_instance_id: "openbot-connectors",
      memory_bank_ids: ["shared-bank", "installation-bank"],
    });
    expect(permissions.operator).toEqual({
      create_multiplayer_sessions: { with_users: { mode: "none" }, with_agents: { mode: "none" } },
      delegate_to_other_agents: { mode: "none" },
    });

    await provider.deployable.deploy(context("memory-catcher", "subagent"));
    expect((bundles["memory-catcher"] as { memory?: unknown }).memory).toBeUndefined();
    expect(bundles["memory-catcher"]).toMatchObject({
      agent: { automatic_memory_mode: "none" },
      skill_registry: { id: "shared-registry" },
    });
    expect(agentUpdates["memory-catcher"]).toBeUndefined();
    expect(permissions["memory-catcher"]).toMatchObject({
      delegate_to_other_agents: { mode: "none" },
    });

    // A second primary deployment pins the recorded bank and registry instead of creating more.
    await provider.deployable.deploy(context("factory", "primary"));
    expect(bundles.factory).toMatchObject({
      skill_registry: { id: "shared-registry" },
      memory: { bank: { id: "shared-bank", enabled: true } },
    });
    expect(connectorsUpdates).toBe(0);

    // An explicit owner override wins over the bundle's recorded owner.
    environment.OPENBOT_OWNER_USER_ID = "user-owner";
    await provider.deployable.deploy(context("factory", "primary"));
    expect(permissions.factory).toMatchObject({
      create_multiplayer_sessions: { with_users: { mode: "only", ids: ["user-owner"] } },
    });

    // The resolver sees no owner when neither source names one and may fail closed.
    delete environment.OPENBOT_OWNER_USER_ID;
    provisionedOwner = "";
    await expect(provider.deployable.deploy(context("factory", "primary"))).rejects.toThrow(
      "No owner is known for factory",
    );
  });

  it("applies permissions without sharing resources and leaves agents alone when the resolver declines", async () => {
    vi.spyOn(TildeSkillReconciler.prototype, "bundleSkills").mockResolvedValue({
      custom: [],
      managed: [],
    });
    vi.spyOn(TildeToolReconciler.prototype, "deployExternalResources").mockResolvedValue();
    const context = await agentContext("scout");
    Object.assign(context.environment, {
      AGENT_SCOUT_API_KEY: "existing-key",
      AGENT_SCOUT_WEBHOOK_SIGNING_KEY: "existing-signing-key",
    });
    const requests: Request[] = [];
    const permissions: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        requests.push(request.clone());
        const path = new URL(request.url).pathname;
        if (request.method === "PUT" && path.endsWith("/agents/scout/provision")) {
          const body = (await request.json()) as { skill_registry: { name: string } };
          expect(body.skill_registry.name).toBe("OpenBot scout");
          return Response.json(operation("active", false));
        }
        if (request.method === "PUT" && path.endsWith("/agents/scout/avatar"))
          return Response.json({ principal_user_id: "machine-scout", avatar: {} });
        if (request.method === "PUT" && path.endsWith("/permissions")) {
          permissions.push(await request.json());
          return Response.json({ agent_id: "scout" });
        }
        if (request.method === "GET" && path.endsWith("/channels"))
          return Response.json({
            items: [
              {
                id: "openbot-chatkit-workspace-scout",
                configuration: { default_agent_inbox_id: "scout" },
              },
            ],
          });
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );

    let decline = true;
    const provider = new TildeAgentProvider(config, {
      permissions: (agent) =>
        decline
          ? undefined
          : {
              create_multiplayer_sessions: {
                with_users: { mode: "only", ids: [agent.ownerUserId!] },
                with_agents: { mode: "none" },
              },
              delegate_to_other_agents: { mode: "none" },
            },
    });
    await provider.deployable.deploy(context);
    expect(permissions).toEqual([]);
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
    expect(context.environment.OPENBOT_SHARED_MEMORY_BANK_ID).toBeUndefined();

    decline = false;
    await provider.deployable.deploy(context);
    expect(permissions).toEqual([
      {
        create_multiplayer_sessions: {
          with_users: { mode: "only", ids: ["human-owner"] },
          with_agents: { mode: "none" },
        },
        delegate_to_other_agents: { mode: "none" },
      },
    ]);
  });

  it("reports durable provisioning failures", async () => {
    vi.spyOn(TildeSkillReconciler.prototype, "bundleSkills").mockResolvedValue({
      custom: [],
      managed: [],
    });
    const context = await agentContext("scout");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...operation("error", false), error_message: "wiki provider unavailable" }),
      ),
    );
    await expect(new TildeAgentProvider(config).deployable.deploy(context)).rejects.toThrow(
      "wiki provider unavailable",
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

/** Owner-only trust: only the owner reaches the primary, which alone reaches its subagents. */
function ownerOnlyPermissions(agent: ReconciledAgent & { ownerUserId: string }) {
  if (agent.kind === "primary")
    return {
      create_multiplayer_sessions: {
        with_users: { mode: "only" as const, ids: [agent.ownerUserId] },
        with_agents: { mode: "none" as const },
      },
      delegate_to_other_agents:
        agent.subagentIds.length > 0
          ? { mode: "only" as const, ids: [...agent.subagentIds] }
          : { mode: "none" as const },
    };
  return {
    create_multiplayer_sessions: {
      with_users: { mode: "none" as const },
      with_agents: { mode: "none" as const },
    },
    delegate_to_other_agents: { mode: "none" as const },
  };
}

function operation(status: string, outputsAvailable: boolean, mcpId = "openbot-scout") {
  return {
    operation_id: "operation-one",
    org_id: "org-one",
    team_id: "team-one",
    agent_id: "scout",
    owner_user_id: "human-owner",
    generation: 1,
    status,
    attempts: 1,
    outputs_available: outputsAvailable,
    resources: [{ kind: "mcp_server", key: "default", id: mcpId, created_by_operation: true }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
