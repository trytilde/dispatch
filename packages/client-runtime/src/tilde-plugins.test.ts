import { describe, expect, it, vi } from "vite-plus/test";
import { createTildePluginsClient } from "./tilde-plugins.js";

describe("Tilde plugin client", () => {
  it("prefers first-class providers, resolves their Tilde icons, and caches one snapshot", async () => {
    const requestJson = vi.fn(async (path: string) => {
      if (path.startsWith("/api/tilde/user-tools/mcp/tool-providers?"))
        return {
          tool_providers: [
            {
              type_id: "stripe",
              name: "Stripe",
              icon_url: "/app/images/tool-provider-icons/stripe.svg",
            },
            {
              type_id: "agentmail",
              name: "AgentMail",
              icon_url: "/app/images/tool-provider-icons/agentmail.svg",
            },
          ],
          tool_accounts: [
            {
              id: "stripe-work",
              display_name: "Work",
              status: "active",
              tool_group_source_type_id: "stripe",
            },
          ],
          mcp_servers: [],
          proxied_mcp_servers: [],
          managed_providers: [
            { id: "stripe", name: "Stripe", tool_provider_type_id: "managed_mcp:stripe" },
            { id: "agentmail", name: "AgentMail", tool_provider_type_id: "managed_mcp:agentmail" },
          ],
        };
      return { skills: [], skill_registries: [], skill_providers: [] };
    });
    const client = createTildePluginsClient({
      requestJson,
      apiBaseUrl: () => "https://api.trytilde.ai",
    });

    const first = await client.getPluginsCatalog();
    const second = await client.getPluginsCatalog();

    expect(first.tools.map(({ provider }) => provider.type_id)).toEqual(["stripe", "agentmail"]);
    expect(first.tools[0]?.accounts).toHaveLength(1);
    expect(first.tools[0]?.provider.icon_url).toBe(
      "https://api.trytilde.ai/app/images/tool-provider-icons/stripe.svg",
    );
    expect(second).toEqual(first);
    expect(
      requestJson.mock.calls.filter(([path]) =>
        String(path).startsWith("/api/tilde/user-tools/mcp/tool-providers?"),
      ),
    ).toHaveLength(1);
  });

  it("requests one inventory per resource and keeps scope caches separate", async () => {
    const requestJson = vi.fn(async (path: string) =>
      path.includes("/mcp/tool-providers?")
        ? {
            tool_providers: [{ type_id: "github", name: "GitHub" }],
            tool_accounts: [],
            mcp_servers: [],
            proxied_mcp_servers: [],
            managed_providers: [],
          }
        : { skills: [], skill_providers: [], skill_registries: [] },
    );
    const client = createTildePluginsClient(requestJson);
    await client.getPluginsCatalog("all");
    await client.getPluginsCatalog("all");
    expect(requestJson).toHaveBeenCalledTimes(2);
    await client.getPluginsCatalog("personal");
    expect(requestJson).toHaveBeenCalledTimes(4);
    expect(requestJson).toHaveBeenCalledWith(
      "/api/tilde/user-tools/mcp/tool-providers?scope=personal",
    );
    expect(requestJson).toHaveBeenCalledWith("/api/tilde/user-tools/skills?scope=personal");
  });

  it("uses provider setup directly for ordinary connectors", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      resource: {
        id: "github-work",
        display_name: "Work",
        status: "active",
        tool_group_source_type_id: "github",
      },
      next_action: { type: "complete" },
    });
    const client = createTildePluginsClient(requestJson);

    await expect(
      client.createNativeConnectorAccount({
        providerTypeId: "github",
        credentialSourceTypeId: "github_api_key",
        displayName: "Work",
        resourceServerValues: { api_key: "secret" },
      }),
    ).resolves.toMatchObject({ status: "created", account: { id: "github-work" } });
    expect(requestJson).toHaveBeenCalledWith(
      "/api/tilde/provider-setup/start",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"provider_id":"github"'),
      }),
    );
  });

  it("uses Tilde's managed connection API for dynamic OAuth providers", async () => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: "notion",
            name: "Notion",
            connection_method: "oauth_dynamic_client_registration",
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "authorization_required",
        oauth: {
          tool_group_instance: { id: "notion-work", display_name: "Work", status: "pending" },
          broker_response: { type: "redirect", url: "https://notion.test/authorize" },
        },
      });
    const client = createTildePluginsClient(requestJson);

    await expect(
      client.createNativeConnectorAccount({
        providerTypeId: "managed_mcp:notion",
        credentialSourceTypeId: "managed_mcp_oauth",
        displayName: "Work",
        returnUrl: "https://openbot.test/connectors/authorized",
      }),
    ).resolves.toEqual({
      status: "authorize",
      account: {
        id: "notion-work",
        display_name: "Work",
        status: "pending",
        provider_type_id: "managed_mcp:notion",
      },
      authorization_url: "https://notion.test/authorize",
    });
    expect(requestJson).toHaveBeenLastCalledWith(
      "/api/tilde/mcp/provider-catalog/notion/connect",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("encrypts manual managed API keys with the authenticated Tilde team", async () => {
    const calls: Array<{ path: string; body?: string }> = [];
    const requestJson = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, ...(typeof init?.body === "string" ? { body: init.body } : {}) });
      if (path === "/api/tilde/mcp/provider-catalog")
        return {
          items: [
            {
              id: "sentry",
              name: "Sentry",
              connection_method: "manual",
              suggested_auth_mode: "bearer_token",
              endpoint_url: "https://mcp.sentry.dev",
            },
          ],
        };
      if (path === "/auth/session")
        return {
          authenticated: true,
          tilde: { team_id: "team-one", api_base_url: "https://tilde.test" },
          user: { subject: "human-one", name: "Daniel" },
        };
      if (path.endsWith("/encrypt")) return { ciphertext: "encrypted" };
      if (path.endsWith("/resource-server")) return { id: "credential-one" };
      if (path === "/api/tilde/mcp/proxied-mcp-servers")
        return {
          tool_group_instance: { id: "sentry-work", display_name: "Work", status: "active" },
        };
      throw new Error(`Unexpected request: ${path}`);
    });
    const client = createTildePluginsClient(requestJson);

    await expect(
      client.createNativeConnectorAccount({
        providerTypeId: "managed_mcp:sentry",
        credentialSourceTypeId: "api_key",
        displayName: "Work",
        resourceServerValues: { api_key: "secret" },
      }),
    ).resolves.toMatchObject({ status: "created", account: { id: "sentry-work" } });
    expect(calls.find((call) => call.path.endsWith("/encrypt"))?.body).toContain(
      '"dek_alias":"team:team-one:default"',
    );
    expect(
      calls.find((call) => call.path === "/api/tilde/mcp/proxied-mcp-servers")?.body,
    ).toContain('"resource_server_credential_id":"credential-one"');
  });
});

describe("personal catalog ownership", () => {
  it("deletes in the personal namespace and prevents treating federation as a team account binding", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("/mcp/tool-providers?"))
        return {
          tool_providers: [{ type_id: "github", name: "GitHub" }],
          tool_accounts: [
            {
              id: "personal-account",
              display_name: "Personal",
              status: "active",
              tool_group_source_type_id: "github",
              personal_user_id: "owner",
              enabled_for_personal: true,
              assigned_agent_ids: ["assistant"],
            },
          ],
          mcp_servers: [],
          proxied_mcp_servers: [],
          managed_providers: [],
        };
      if (path.includes("/user-tools/skills?"))
        return { skills: [], skill_providers: [], skill_registries: [] };
      return { items: [] };
    });
    const client = createTildePluginsClient(request);
    await client.deleteConnectorAccounts(["personal-account"]);
    expect(request).toHaveBeenCalledWith(
      "/api/tilde/user-tools/personal/owner/mcp/tool-group/personal-account",
      { method: "DELETE" },
    );
    await expect(
      client.setToolAccountForAgent("personal-account", "assistant", false),
    ).rejects.toThrow("inherited");
    expect(request.mock.calls.some(([path]) => path.includes("enable-and-bind"))).toBe(false);
  });
});
