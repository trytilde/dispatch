import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchRequestHandler } from "./fetch-handler.js";
import { issueSessionCookie } from "./crypto.js";

const setupCode = "openbot-fetch-test-setup-code";
process.env.OPENBOT_SETUP_CODE = setupCode;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENBOT_TILDE_API_KEY;
  delete process.env.OPENBOT_TILDE_WEBHOOK_SIGNING_KEY;
  delete process.env.OPENBOT_TILDE_ORG_ID;
  delete process.env.OPENBOT_TILDE_TEAM_ID;
});

describe("Fetch dispatcher", () => {
  it("dispatches Hono and the official Connect fetch adapter", async () => {
    const health = await fetchRequestHandler(new Request("https://openbot.test/healthz"));
    expect(health.status).toBe(200);

    const rpc = await fetchRequestHandler(new Request(
      "https://openbot.test/rpc/openbot.control.v1.InstallationService/GetStatus",
      {
        method: "POST",
        headers: { "content-type": "application/json", "connect-protocol-version": "1" },
        body: "{}",
      }),
    );
    expect(rpc.status).toBe(401);
    await expect(rpc.json()).resolves.toMatchObject({ code: "unauthenticated" });
  });

  it("serves agent sessions through the control protocol and internal provider", async () => {
    process.env.OPENBOT_TILDE_API_KEY = "test-api-key";
    process.env.OPENBOT_TILDE_WEBHOOK_SIGNING_KEY = "test-signing-key";
    process.env.OPENBOT_TILDE_ORG_ID = "org-one";
    process.env.OPENBOT_TILDE_TEAM_ID = "team-one";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("/chatkit/mission-control/agents/agent-one/sessions");
      return Response.json({ items: [{
        id: "session-one",
        title: "First session",
        unread: true,
        created_at: "2026-08-12T00:00:00.000Z",
        updated_at: "2026-08-12T01:00:00.000Z",
      }] });
    }));

    const cookie = issueSessionCookie(setupCode, true).split(";")[0] ?? "";
    const rpc = await fetchRequestHandler(new Request(
      "https://openbot.test/rpc/openbot.control.v1.ChatService/ListSessions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "connect-protocol-version": "1",
          cookie,
        },
        body: JSON.stringify({ agentId: "agent-one" }),
      },
    ));

    expect(rpc.status).toBe(200);
    await expect(rpc.json()).resolves.toMatchObject({
      sessions: [{ id: "session-one", agentId: "agent-one", title: "First session", unread: true }],
    });
  });
});
