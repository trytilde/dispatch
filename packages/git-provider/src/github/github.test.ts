import { TildePlatform } from "@tryopenbot/platform-integrations";
import { DeploymentOutputs, type DeploymentContext } from "@tryopenbot/runtime-provider";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GitHubGitProvider } from "./index.js";

afterEach(() => vi.unstubAllGlobals());

function platform(): TildePlatform {
  return new TildePlatform({
    apiKey: "secret",
    orgId: "org-one",
    teamId: "team-one",
    baseUrl: "https://tilde.test",
  });
}

function deploymentContext(): DeploymentContext & { events: string[] } {
  const events: string[] = [];
  return {
    devMode: false,
    repositoryRoot: "/repo",
    environment: { OPENBOT_DEPLOYMENT_NAME: "OpenBot" },
    inputs: new DeploymentOutputs(),
    platformIds: ["tilde"],
    report: ({ event }) => void events.push(event),
    events,
  };
}

function githubGroup(credentialId?: string): Record<string, unknown> {
  return {
    id: "github-group",
    display_name: "OpenBot GitHub",
    tool_group_source_type_id: "github",
    credential_source_type_id: "server_token_exchange",
    status: credentialId ? "active" : "pending",
    resource_server_credential_id: credentialId ?? null,
  };
}

describe("GitHubGitProvider", () => {
  it("provisions the GitHub App and surfaces the authorization action while pending", async () => {
    const mutations: string[] = [];
    let provisioned = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "GET" && path.endsWith("/mcp/tool-group"))
          return Response.json({ items: provisioned ? [githubGroup()] : [] });
        if (request.method === "POST" && path.endsWith("/auto-provision")) {
          mutations.push("auto-provision");
          provisioned = true;
          return Response.json({
            provider_provisioning_response: {
              next_action: { type: "redirect", url: "https://github.test/install" },
            },
            tool_group_instance: githubGroup(),
          });
        }
        if (request.method === "POST" && path.endsWith("/user-credential/broker")) {
          mutations.push("broker");
          return Response.json({
            type: "broker_state",
            action: { Redirect: { url: "https://github.test/install" } },
            id: "broker-one",
            owner_id: "github-group",
            owner_type: "tool_group_instance",
          });
        }
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );
    const context = deploymentContext();
    const provider = new GitHubGitProvider(platform());
    await provider.deployable.deploy(context);
    expect(mutations).toEqual(["auto-provision", "broker"]);
    expect(context.events).toContain("git.github.authorization.required");
    expect(context.events).toContain("git.github.pending");
    expect(context.environment.GIT_GITHUB_TOOL_GROUP_ID).toBe("github-group");
    expect(context.environment.GIT_GITHUB_REST_PROXY_PROFILE_ID).toBeUndefined();
  });

  it("idempotently reconciles reverse-proxy profiles once the credential is connected", async () => {
    const profiles = new Map<string, Record<string, unknown>>();
    const mutations: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "GET" && path.endsWith("/mcp/tool-group"))
          return Response.json({ items: [githubGroup("credential-github")] });
        if (request.method === "GET" && path.endsWith("/reverse-proxy/profile"))
          return Response.json({ items: [...profiles.values()] });
        if (request.method === "POST" && path.endsWith("/reverse-proxy/profile")) {
          const body = (await request.json()) as { id: string; provider_id: string };
          mutations.push(`create:${body.id}`);
          const profile = {
            id: body.id,
            provider_id: body.provider_id,
            resource_server_credential_id: "credential-github",
            enabled: true,
            base_url: "https://github.test",
          };
          profiles.set(body.id, profile);
          return Response.json(profile);
        }
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );
    const context = deploymentContext();
    const provider = new GitHubGitProvider(platform());
    await provider.deployable.deploy(context);
    await provider.deployable.deploy(context);
    expect(mutations).toEqual(["create:openbot-github-rest", "create:openbot-github-git"]);
    expect(context.environment).toMatchObject({
      GIT_GITHUB_TOOL_GROUP_ID: "github-group",
      GIT_GITHUB_CREDENTIAL_ID: "credential-github",
      GIT_GITHUB_REST_PROXY_PROFILE_ID: "openbot-github-rest",
      GIT_GITHUB_GIT_PROXY_PROFILE_ID: "openbot-github-git",
    });
  });

  it("re-attaches a rotated credential to existing profiles", async () => {
    const updates: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "GET" && path.endsWith("/mcp/tool-group"))
          return Response.json({ items: [githubGroup("credential-rotated")] });
        if (request.method === "GET" && path.endsWith("/reverse-proxy/profile"))
          return Response.json({
            items: [
              {
                id: "openbot-github-rest",
                provider_id: "github",
                resource_server_credential_id: "credential-stale",
                enabled: false,
              },
              {
                id: "openbot-github-git",
                provider_id: "github_git_https",
                resource_server_credential_id: "credential-rotated",
                enabled: true,
              },
            ],
          });
        if (path.endsWith("/reverse-proxy/profile/openbot-github-rest")) {
          updates.push("update:openbot-github-rest");
          return Response.json({
            id: "openbot-github-rest",
            provider_id: "github",
            resource_server_credential_id: "credential-rotated",
            enabled: true,
          });
        }
        throw new Error(`Unexpected request: ${request.method} ${path}`);
      }),
    );
    const context = deploymentContext();
    const provider = new GitHubGitProvider(platform());
    await provider.deployable.deploy(context);
    expect(updates).toEqual(["update:openbot-github-rest"]);
    expect(context.environment.GIT_GITHUB_CREDENTIAL_ID).toBe("credential-rotated");
  });
});
