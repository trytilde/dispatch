import {
  signBody,
  TILDE_WEBHOOK_ID_HEADER,
  TILDE_WEBHOOK_SIGNATURE_HEADER,
  TILDE_WEBHOOK_TIMESTAMP_HEADER,
} from "@trytilde/harness-sdk-vercel-ai-node";
import { describe, expect, it } from "vite-plus/test";
import { httpApp, sandboxToolEndpoint } from "./http.js";

process.env.OPENBOT_SETUP_CODE = "openbot-http-test-setup-code";

describe("HTTP route boundaries", () => {
  it("keeps health public and chat protected", async () => {
    const health = await httpApp.request("http://openbot.test/healthz");
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ ok: true, service: "openbot" });

    const chat = await httpApp.request("http://openbot.test/api/chat", { method: "POST" });
    expect(chat.status).toBe(401);
  });

  it("accepts signed tool discovery and rejects a bad signature", async () => {
    const key = "whsec-openbot-test";
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      [TILDE_WEBHOOK_ID_HEADER]: "webhook-openbot-test",
      [TILDE_WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
      [TILDE_WEBHOOK_SIGNATURE_HEADER]: signBody(key, timestamp, new Uint8Array()),
    };
    const response = await sandboxToolEndpoint(
      new Request("https://openbot.test/api/tilde/tools/sandbox", { headers }),
      key,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      invoke_url: "https://openbot.test/api/tilde/tools/sandbox",
      tools: [{ type_id: "sandbox_exec" }],
    });

    const rejected = await sandboxToolEndpoint(
      new Request("https://openbot.test/api/tilde/tools/sandbox", {
        headers: { ...headers, [TILDE_WEBHOOK_SIGNATURE_HEADER]: "hmac-sha256=incorrect" },
      }),
      key,
    );
    expect(rejected.status).toBe(401);
  });
});
