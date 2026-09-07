import { Hono } from "hono";
import { describe, expect, it, vi } from "vite-plus/test";
import { registerTildeProxy } from "./tilde-proxy.js";

function fixture(owner: boolean) {
  const app = new Hono();
  if (owner)
    app.use("*", async (context, next) => {
      context.set("ownerAccessToken", "fixture-owner-token");
      await next();
    });
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ ok: true }));
  registerTildeProxy(app, {
    apiKey: "fixture-installation-key",
    orgId: "org-one",
    teamId: "team-one",
    baseUrl: "https://tilde.test",
    fetch,
  });
  return { app, fetch };
}

describe("owner resource bridge", () => {
  it("uses the human credential for personal deletion and preserves native scope", async () => {
    const { app, fetch } = fixture(true);
    const response = await app.request(
      "https://app.test/api/tilde/user-tools/personal/user-one/mcp/tool-group/account-one",
      { method: "DELETE" },
    );
    expect(response.status).toBe(200);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url instanceof Request ? url.url : url instanceof URL ? url.href : url).toBe(
      "https://tilde.test/api/v1/user/user-one/mcp/tool-group/account-one",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer fixture-owner-token");
    expect(headers.has("x-api-key")).toBe(false);
  });
  it("never substitutes the installation key for an absent human credential", async () => {
    const { app, fetch } = fixture(false);
    const response = await app.request(
      "https://app.test/api/tilde/user-tools/mcp/tool-providers?scope=personal",
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
