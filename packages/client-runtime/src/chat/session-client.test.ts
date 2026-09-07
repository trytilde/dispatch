import { describe, expect, it, vi } from "vite-plus/test";
import { createOpenBotClient } from "./client.js";

describe("session transport", () => {
  it("includes the exact session filter and page token on server search", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    const client = createOpenBotClient({ fetch });
    await client.searchChatKit(" important words ", "session/one", "page-two");
    const input = fetch.mock.calls[0]![0];
    const url = new URL(typeof input === "string" ? input : input.url, "https://example.test");
    expect(url.pathname).toBe("/api/chat/workspace/search");
    expect(url.searchParams.get("session_id")).toBe("session/one");
    expect(url.searchParams.get("q")).toBe("important words");
    expect(url.searchParams.get("next_page_token")).toBe("page-two");
  });
  it("loads paginated human identities without exposing IDs as names", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              user: {
                id: "person",
                display_name: "Alex",
                email: "alex@example.test",
                user_type: "human",
              },
            },
          ],
          next_page_token: "next",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [{ user: { id: "agent-user", display_name: "Service", user_type: "agent" } }],
        }),
      );
    const people = await createOpenBotClient({ fetch }).getTeamPeople();
    expect(people).toEqual([
      { id: "person", userId: "person", kind: "human", name: "Alex", email: "alex@example.test" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
