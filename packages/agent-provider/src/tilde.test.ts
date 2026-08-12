import { afterEach, describe, expect, it, vi } from "vitest";
import { TildeAgentProvider } from "./tilde.js";

const config = { apiKey: "secret", orgId: "org-one", teamId: "team-one", baseUrl: "https://tilde.test" };
const context = { requestId: "request-one" };

afterEach(() => vi.unstubAllGlobals());

describe("TildeAgentProvider", () => {
  it("maps grouped Mission Control sessions", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input);
      expect(url).toContain("/chatkit/mission-control/sidebar?");
      expect(url).toContain("agent_sort=updated_at");
      return Response.json({
        items: [{
          id: "agent-one",
          display_name: "Scout",
          provider_id: "chatkit.http-vercel-ai-sdk",
          status: "enabled",
          has_vercel_ui_endpoint: true,
          created_at: "2026-08-12T00:00:00.000Z",
          updated_at: "2026-08-12T01:00:00.000Z",
          sessions: {
            items: [{ id: "session-one", title: "Hello", unread: true, created_at: "2026-08-12T00:00:00.000Z", updated_at: "2026-08-12T01:00:00.000Z" }],
            next_page_token: "sessions-next",
          },
        }],
        next_page_token: "agents-next",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TildeAgentProvider(config).listSessionGroups({}, context);
    expect(result.nextPageToken).toBe("agents-next");
    expect(result.items[0]).toMatchObject({
      agent: { id: "agent-one", displayName: "Scout" },
      sessions: { nextPageToken: "sessions-next", items: [{ id: "session-one", agentId: "agent-one", unread: true }] },
    });
  });

  it("registers and unregisters agents without exposing control operations as tools", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = input instanceof Request ? input.method : init?.method;
      if (method === "DELETE") return new Response(null, { status: 204 });
      expect(url).toContain("/chatkit/agents/http-vercel-ai-sdk");
      const body = input instanceof Request ? await input.clone().text() : String(init?.body ?? "");
      expect(body).toContain("https://openbot.test/api/agents/scout");
      return Response.json({
        agent: { id: "scout", configuration: { display_name: "Scout", endpoint_url: "https://openbot.test/api/agents/scout" }, status: "enabled" },
        api_key: "agent-api-key",
        webhook_signing_key: "signing-key",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TildeAgentProvider(config);
    const registered = await provider.registerAgent({ id: "scout", displayName: "Scout", endpointUrl: new URL("https://openbot.test/api/agents/scout") }, context);
    expect(registered).toMatchObject({ agent: { id: "scout" }, credentials: { apiKey: "agent-api-key" } });
    expect("registerTools" in provider).toBe(false);
    await provider.unregisterAgent("scout", context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates sessions and sends messages", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input);
      if (url.endsWith("/sessions")) {
        return Response.json({ session: { id: "session-one", created_at: "2026-08-12T00:00:00.000Z", updated_at: "2026-08-12T00:00:00.000Z" } });
      }
      return Response.json({ items: [
        { id: "message-user", session_id: "session-one", role: "user", text: "hello", created_at: "2026-08-12T00:00:01.000Z" },
        { id: "message-agent", session_id: "session-one", role: "assistant", parts: [{ text: "hi" }], created_at: "2026-08-12T00:00:02.000Z" },
      ] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TildeAgentProvider(config);
    const session = await provider.createSession("agent-one", undefined, context);
    const messages = await provider.sendMessage("agent-one", session.id, "hello", context);
    expect(session).toMatchObject({ id: "session-one", agentId: "agent-one" });
    expect(messages.items.map((message) => [message.role, message.text])).toEqual([["user", "hello"], ["assistant", "hi"]]);
  });
});

function requestUrl(input: string | URL | Request): string {
  return input instanceof Request ? input.url : String(input);
}
