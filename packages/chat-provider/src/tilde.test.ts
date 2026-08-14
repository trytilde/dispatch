import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TildeChatProvider } from "./tilde.js";

const config = {
  apiKey: "secret",
  orgId: "org-one",
  teamId: "team-one",
  baseUrl: "https://tilde.test",
};
const context = { requestId: "request-one" };

afterEach(() => vi.unstubAllGlobals());

describe("TildeChatProvider", () => {
  it("maps grouped Mission Control sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            {
              id: "agent-one",
              display_name: "Scout",
              provider_id: "chatkit.http-vercel-ai-sdk",
              status: "enabled",
              created_at: "2026-08-12T00:00:00.000Z",
              updated_at: "2026-08-12T01:00:00.000Z",
              sessions: {
                items: [
                  {
                    id: "session-one",
                    title: "Hello",
                    unread: true,
                    created_at: "2026-08-12T00:00:00.000Z",
                    updated_at: "2026-08-12T01:00:00.000Z",
                  },
                ],
                next_page_token: "sessions-next",
              },
            },
          ],
          next_page_token: "agents-next",
        }),
      ),
    );

    const result = await new TildeChatProvider(config).listSessionGroups({}, context);
    expect(result).toMatchObject({
      nextPageToken: "agents-next",
      items: [
        {
          agent: { id: "agent-one", displayName: "Scout" },
          sessions: { items: [{ id: "session-one", agentId: "agent-one", unread: true }] },
        },
      ],
    });
  });

  it("does not expose endpoint lifecycle operations", () => {
    const provider = new TildeChatProvider(config);
    expect("registerAgent" in provider).toBe(false);
    expect("updateAgent" in provider).toBe(false);
  });

  it("preserves safe HTTP context from generated-client failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 422, statusText: "Unprocessable Entity" })),
    );

    await expect(
      new TildeChatProvider(config).createSession("agent-one", undefined, context),
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: "Tilde API request failed (HTTP 422 Unprocessable Entity)",
    });
  });
});
