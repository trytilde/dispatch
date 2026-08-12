import { afterEach, describe, expect, it, vi } from "vitest";
import { TildeAgentProvider, TildeChatProvider } from "./tilde.js";

const config = {
  apiKey: "tilde-test-key",
  orgId: "org-test",
  teamId: "team-test",
  baseUrl: "https://tilde.test",
};
const context = { requestId: "test" };

afterEach(() => vi.unstubAllGlobals());

describe("Tilde providers", () => {
  it("maps Tilde-owned agents without creating local metadata", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-api-key")).toBe("tilde-test-key");
      expect(headers.get("x-tilde-org-id")).toBe("org-test");
      return Response.json({
        items: [{
          id: "agent-one",
          status: "enabled",
          configuration: { display_name: "Scout", endpoint_url: "https://openbot.test/api/tilde/chatkit" },
          created_at: "2026-08-12T00:00:00.000Z",
          updated_at: "2026-08-12T01:00:00.000Z",
        }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new TildeAgentProvider(config).list(context)).resolves.toMatchObject([
      { id: "agent-one", displayName: "Scout", status: "enabled" },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/team/team-test/chatkit/agents");
  });

  it("creates and sends through Tilde ChatKit sessions", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        expect(init?.method).toBe("POST");
        return Response.json({ session: { id: "session-one", created_at: "2026-08-12T00:00:00.000Z", updated_at: "2026-08-12T00:00:00.000Z" } });
      }
      expect(url).toContain("/sessions/session-one/messages");
      expect(init?.body).toContain("hello");
      return Response.json({ items: [
        { id: "message-user", session_id: "session-one", role: "user", type: "text", text: "hello", created_at: "2026-08-12T00:00:01.000Z" },
        { id: "message-agent", session_id: "session-one", role: "assistant", type: "ui", parts: [{ type: "text", text: "hi" }], created_at: "2026-08-12T00:00:02.000Z" },
      ] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new TildeChatProvider(config);
    const session = await provider.createSession("agent-one", undefined, context);
    const messages = await provider.sendMessage("agent-one", session.id, "hello", context);

    expect(session).toMatchObject({ id: "session-one", agentId: "agent-one" });
    expect(messages.map((message) => [message.role, message.text])).toEqual([["user", "hello"], ["assistant", "hi"]]);
  });
});
