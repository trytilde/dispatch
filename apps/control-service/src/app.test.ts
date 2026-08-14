import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ChatProvider } from "@tryopenbot/chat-provider";
import { app, createApp } from "./app.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("bare OpenBot server", () => {
  it("reports healthy without setup", async () => {
    const response = await app.request("https://openbot.test/healthz");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "openbot" });
  });

  it("federates the empty control namespace", async () => {
    const response = await app.request(
      "https://openbot.test/rpc/openbot.control.v1.ControlService/Unknown",
      {
        method: "POST",
      },
    );
    expect(response.status).toBe(404);
  });

  it("does not expose an API namespace", async () => {
    const response = await app.request("https://openbot.test/api/setup/unlock", { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("federates chat operations through the configured provider", async () => {
    const chatProvider = {
      async listAgents() {
        return {
          items: [
            {
              id: "hello-world",
              displayName: "Hello World",
              providerId: "test",
              status: "ready",
              hasUiEndpoint: true,
              createdAt: new Date(0),
              updatedAt: new Date(0),
            },
          ],
        };
      },
    } as unknown as ChatProvider;
    const chatApp = createApp({ chatProvider });
    const response = await chatApp.request(
      "https://openbot.test/rpc/openbot.control.v1.ControlService/ListAgents",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "connect-protocol-version": "1",
        },
        body: "{}",
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      agents: [{ id: "hello-world", displayName: "Hello World", status: "ready" }],
    });
  });

  it("serves built web assets and SPA routes when a web root is available", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "openbot-hono-web-"));
    temporaryRoots.push(webRoot);
    await mkdir(join(webRoot, "assets"));
    await writeFile(join(webRoot, "index.html"), "<main>OpenBot web</main>");
    await writeFile(join(webRoot, "assets", "app.js"), "export const ready = true;");
    const webApp = createApp({ webRoot });

    const asset = await webApp.request("https://openbot.test/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

    const frontendRoute = await webApp.request("https://openbot.test/api/setup/unlock");
    expect(frontendRoute.status).toBe(200);
    expect(frontendRoute.headers.get("cache-control")).toBe("no-cache");
    await expect(frontendRoute.text()).resolves.toBe("<main>OpenBot web</main>");
  });
});
