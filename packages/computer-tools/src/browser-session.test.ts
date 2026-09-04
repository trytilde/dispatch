import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { ComputerService } from "@tryopenbot/computer-service-proto";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createBrowserSessionTool } from "./index.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe("browser_session tool", () => {
  it("returns the Tilde browser session for the fixed agent through the typed service", async () => {
    const ensureBrowserSession = vi.fn(async () => ({
      browserSessionId: "session-one",
      previewUrl: "https://openbot.exe.xyz/api/computer/computer/preview",
      remoteDebuggingPort: 9210,
      runtimeConnected: true,
    }));
    const authorizations: Array<string | null> = [];
    const server = createServer(
      connectNodeAdapter({
        requestPathPrefix: "/rpc",
        routes: (router) =>
          router.service(ComputerService, {
            ensureBrowserSession: async (request, context) => {
              authorizations.push(context.requestHeader.get("authorization"));
              expect(request.agentId).toBe("computer");
              return ensureBrowserSession();
            },
          }),
      }),
    );
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const browserSession = createBrowserSessionTool({
      agentId: "computer",
      baseUrl: `http://127.0.0.1:${port}/rpc`,
      apiKey: "computer-service-key",
    });
    expect(browserSession.inputSchema).toBeDefined();
    const execute = browserSession.execute as
      | ((
          input: Record<string, never>,
          execution: { toolCallId: string; messages: never[]; abortSignal: AbortSignal },
        ) => Promise<unknown>)
      | undefined;
    if (!execute) throw new Error("browser_session has no execute function");

    await expect(
      execute(
        {},
        { toolCallId: "call-one", messages: [], abortSignal: new AbortController().signal },
      ),
    ).resolves.toEqual({
      browser_session_id: "session-one",
      preview_url: "https://openbot.exe.xyz/api/computer/computer/preview",
      remote_debugging_port: 9210,
      runtime_connected: true,
    });
    expect(ensureBrowserSession).toHaveBeenCalledOnce();
    expect(authorizations).toEqual(["Bearer computer-service-key"]);
  });
});
