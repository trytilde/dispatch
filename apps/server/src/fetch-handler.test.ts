import { describe, expect, it } from "vite-plus/test";
import { fetchRequestHandler } from "./fetch-handler.js";

process.env.OPENBOT_SETUP_CODE = "openbot-fetch-test-setup-code";

describe("Fetch dispatcher", () => {
  it("dispatches Hono and the official Connect fetch adapter", async () => {
    const health = await fetchRequestHandler(new Request("https://openbot.test/healthz"));
    expect(health.status).toBe(200);

    const rpc = await fetchRequestHandler(
      new Request("https://openbot.test/rpc/openbot.v1.InstallationService/GetStatus", {
        method: "POST",
        headers: { "content-type": "application/json", "connect-protocol-version": "1" },
        body: "{}",
      }),
    );
    expect(rpc.status).toBe(401);
    await expect(rpc.json()).resolves.toMatchObject({ code: "unauthenticated" });
  });
});
