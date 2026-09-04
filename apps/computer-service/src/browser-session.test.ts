import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  BrowserSessionManager,
  TildeBrowserSessionRegistry,
  bootstrapTrustedRuntime,
  extensionRuntimeTargetIds,
  ownerPreviewUrl,
  remoteDebuggingPort,
  runtimeBootstrapExpression,
  tildeBrowserSessionRegistryFromEnvironment,
  type BrowserSessionRegistry,
  type CdpTransport,
} from "./browser-session.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const tenant = { apiBaseUrl: "https://api.tilde.test", orgId: "org-one", teamId: "team-one" };

function fakeRegistry(): BrowserSessionRegistry & { create: ReturnType<typeof vi.fn> } {
  return {
    tenant,
    create: vi.fn(async () => ({ id: "session-one", runtime_token: "runtime-secret" })),
  };
}

/** Chrome DevTools fake: the extension worker appears after `workerAppearsAfter` target polls. */
function fakeCdp(options: { workerAppearsAfter?: number; connected?: boolean } = {}) {
  let polls = 0;
  const calls: Array<{ method: string; params: Record<string, unknown>; sessionId?: string }> = [];
  const transport: CdpTransport & { calls: typeof calls; closed: boolean } = {
    calls,
    closed: false,
    async call(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      if (method === "Target.getTargets") {
        polls += 1;
        if (polls <= (options.workerAppearsAfter ?? 0)) return { targetInfos: [] };
        return {
          targetInfos: [
            { targetId: "page-1", type: "page", url: "https://example.test" },
            {
              targetId: "worker-1",
              type: "service_worker",
              url: "chrome-extension://abcdef/service_worker.js",
            },
          ],
        };
      }
      if (method === "Target.attachToTarget")
        return { sessionId: `attached-${params.targetId as string}` };
      if (method === "Runtime.evaluate")
        return { result: { value: { connected: options.connected ?? true, authenticated: true } } };
      throw new Error(`unexpected ${method}`);
    },
    close() {
      this.closed = true;
    },
  };
  return transport;
}

describe("remote debugging ports", () => {
  it("derives one loopback DevTools port per agent display", () => {
    expect(remoteDebuggingPort(":10")).toBe(9210);
    expect(remoteDebuggingPort(":42.0")).toBe(9242);
    expect(() => remoteDebuggingPort("localhost:1")).toThrow("Unsupported agent display");
  });
});

describe("trusted runtime bootstrap", () => {
  it("selects only the extension background worker targets", () => {
    expect(
      extensionRuntimeTargetIds({
        targetInfos: [
          { targetId: "a", type: "page", url: "chrome-extension://x/service_worker.js" },
          { targetId: "b", type: "service_worker", url: "chrome-extension://x/service_worker.js" },
          { targetId: "c", type: "service_worker", url: "https://site.test/sw.js" },
          { targetId: "d", type: "background_page", url: "chrome-extension://y/service_worker.js" },
        ],
      }),
    ).toEqual(["b", "d"]);
  });

  it("keeps the runtime token out of extension storage", () => {
    const expression = runtimeBootstrapExpression({
      ...tenant,
      sessionId: "session-one",
      runtimeToken: "runtime-secret",
    });
    const [assignment = "", storage = ""] = expression.split("await chrome?.storage");
    expect(assignment).toContain('"runtimeToken":"runtime-secret"');
    expect(storage).not.toContain("runtime-secret");
    expect(storage).toContain('"sessionId":"session-one"');
    expect(expression).toContain("__tildeTrustedRuntimeConnect?.()");
  });

  it("waits for the worker, attaches, and evaluates the bootstrap", async () => {
    const cdp = fakeCdp({ workerAppearsAfter: 2 });
    const result = await bootstrapTrustedRuntime(
      cdp,
      { ...tenant, sessionId: "session-one", runtimeToken: "runtime-secret" },
      { intervalMilliseconds: 1 },
    );
    expect(result).toEqual({ connected: true });
    expect(cdp.calls.filter(({ method }) => method === "Target.getTargets")).toHaveLength(3);
    expect(cdp.calls.find(({ method }) => method === "Target.attachToTarget")?.params).toEqual({
      targetId: "worker-1",
      flatten: true,
    });
    const evaluate = cdp.calls.find(({ method }) => method === "Runtime.evaluate");
    expect(evaluate?.sessionId).toBe("attached-worker-1");
    expect(evaluate?.params).toMatchObject({ awaitPromise: true, returnByValue: true });
  });

  it("reports a missing worker without failing the request", async () => {
    const cdp = fakeCdp({ workerAppearsAfter: 99 });
    await expect(
      bootstrapTrustedRuntime(
        cdp,
        { ...tenant, sessionId: "session-one", runtimeToken: "runtime-secret" },
        { attempts: 2, intervalMilliseconds: 1 },
      ),
    ).resolves.toEqual({
      connected: false,
      detail: "trusted-runtime extension worker is not running",
    });
  });
});

describe("browser session manager", () => {
  async function manager(options: {
    registry?: BrowserSessionRegistry;
    listening?: boolean[];
    cdp?: ReturnType<typeof fakeCdp>;
  }) {
    const stateRoot = await mkdtemp(join(tmpdir(), "openbot-browser-session-"));
    temporaryDirectories.push(stateRoot);
    const listening = [...(options.listening ?? [true])];
    const launchBrowser = vi.fn();
    const cdp = options.cdp ?? fakeCdp();
    const instance = new BrowserSessionManager({
      registry: () => options.registry ?? fakeRegistry(),
      ensureDesktop: async () => ({ display: ":10", vncPort: 5910 }),
      desktopEnvironment: (agentId, desktop) => ({ AGENT_ID: agentId, DISPLAY: desktop.display }),
      launchBrowser,
      portListening: async () => (listening.length > 1 ? listening.shift()! : listening[0]!),
      connectDevTools: async () => cdp,
      computerId: () => "openbot-computer",
      previewUrl: (agentId) => `https://openbot.exe.xyz/api/computer/${agentId}/preview`,
      stateRoot,
      intervalMilliseconds: 1,
      browserStartupAttempts: 3,
    });
    return { instance, launchBrowser, stateRoot, cdp };
  }

  it("registers the session once, launches Chrome when needed, and bootstraps the runtime", async () => {
    const registry = fakeRegistry();
    const { instance, launchBrowser, stateRoot, cdp } = await manager({
      registry,
      listening: [false, false, true],
    });

    const first = await instance.ensure("computer");
    expect(first).toEqual({
      browserSessionId: "session-one",
      previewUrl: "https://openbot.exe.xyz/api/computer/computer/preview",
      remoteDebuggingPort: 9210,
      runtimeConnected: true,
    });
    expect(registry.create).toHaveBeenCalledWith(
      {
        runtime: "self_hosted",
        computer_id: "openbot-computer",
        agent_id: "computer",
        preview_url: "https://openbot.exe.xyz/api/computer/computer/preview",
      },
      undefined,
    );
    expect(launchBrowser).toHaveBeenCalledWith({ AGENT_ID: "computer", DISPLAY: ":10" });
    expect(cdp.closed).toBe(true);
    const statePath = join(stateRoot, "computer", "browser-session.json");
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual({
      id: "session-one",
      runtimeToken: "runtime-secret",
    });
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);

    // A repeated call reuses the registered session and re-injects the bootstrap.
    const second = await instance.ensure("computer");
    expect(second.browserSessionId).toBe("session-one");
    expect(registry.create).toHaveBeenCalledTimes(1);
    expect(cdp.calls.filter(({ method }) => method === "Runtime.evaluate")).toHaveLength(2);
  });

  it("returns an unconnected runtime when the extension worker is absent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { instance } = await manager({ cdp: fakeCdp({ workerAppearsAfter: 99 }) });
    const result = await instance.ensure("researcher");
    expect(result.runtimeConnected).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[openbot-browser] trusted runtime bootstrap incomplete",
      expect.objectContaining({ agentId: "researcher" }),
    );
  });

  it("fails when Chrome never publishes its DevTools port", async () => {
    const { instance } = await manager({ listening: [false] });
    await expect(instance.ensure("computer")).rejects.toThrow(
      "did not publish DevTools on port 9210",
    );
  });

  it("rejects invalid agent ids before touching the desktop", async () => {
    const { instance } = await manager({});
    await expect(instance.ensure("Not Valid")).rejects.toThrow("A valid agent_id is required");
  });
});

describe("Tilde browser session registry", () => {
  it("posts a self_hosted session and returns its id and runtime token", async () => {
    const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(init?.body as string)).toEqual({
        runtime: "self_hosted",
        computer_id: "openbot-computer",
        agent_id: "computer",
        preview_url: "https://openbot.exe.xyz/api/computer/computer/preview",
      });
      return Response.json({
        id: "session-one",
        runtime_token: "runtime-secret",
        status: "running",
      });
    });
    const registry = new TildeBrowserSessionRegistry({
      ...tenant,
      apiKey: "api-key",
      fetch: request as unknown as typeof fetch,
    });
    await expect(
      registry.create({
        runtime: "self_hosted",
        computer_id: "openbot-computer",
        agent_id: "computer",
        preview_url: "https://openbot.exe.xyz/api/computer/computer/preview",
      }),
    ).resolves.toEqual({ id: "session-one", runtime_token: "runtime-secret" });
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("https://api.tilde.test/api/v1/team/team-one/browser-session");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("api-key");
  });

  it("requires the Tilde tenant in the service environment", () => {
    expect(() => tildeBrowserSessionRegistryFromEnvironment({})).toThrow(
      "Browser sessions require TILDE_API_KEY",
    );
    expect(
      tildeBrowserSessionRegistryFromEnvironment({
        TILDE_API_KEY: "k",
        TILDE_ORG_ID: "o",
        TILDE_TEAM_ID: "t",
      }).tenant,
    ).toEqual({ apiBaseUrl: "https://api.trytilde.ai", orgId: "o", teamId: "t" });
  });

  it("builds the owner preview route from the configured origin", () => {
    expect(ownerPreviewUrl("computer", {})).toBe("");
    expect(
      ownerPreviewUrl("computer", { COMPUTER_PREVIEW_ORIGIN: "https://openbot.exe.xyz/" }),
    ).toBe("https://openbot.exe.xyz/api/computer/computer/preview");
  });
});
