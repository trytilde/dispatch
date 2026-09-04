import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Code, ConnectError } from "@connectrpc/connect";
import { isRecord } from "@tryopenbot/utilities/json";
import { agentDesktopEnvironment, ensureAgentDesktop, type AgentDesktop } from "./desktop.js";

/**
 * Loopback DevTools port of the Chrome that runs on one agent display. The browser launcher derives
 * the same value from `DISPLAY` (`9200 + display number`), so computer-service can attach to the
 * browser it did not necessarily start.
 */
export const remoteDebuggingPortBase = 9200;

export function remoteDebuggingPort(display: string): number {
  const match = /^:(\d{1,2})(?:\.\d+)?$/.exec(display);
  if (!match) throw new ConnectError(`Unsupported agent display: ${display}`, Code.Internal);
  return remoteDebuggingPortBase + Number(match[1]);
}

/** Registration request for a browser session whose Chrome runs inside this Computer. */
export interface SelfHostedBrowserSessionRequest {
  runtime: "self_hosted";
  computer_id: string;
  agent_id: string;
  preview_url: string;
}

export interface RegisteredBrowserSession {
  id: string;
  runtime_token: string;
}

/** Non-secret fields the trusted-runtime extension needs beside the runtime token. */
export interface RuntimeBootstrapTenant {
  apiBaseUrl: string;
  orgId: string;
  teamId: string;
}

/** Tilde browser-session registration boundary; the HTTP adapter and the test fake implement it. */
export interface BrowserSessionRegistry {
  readonly tenant: RuntimeBootstrapTenant;
  create(
    request: SelfHostedBrowserSessionRequest,
    signal?: AbortSignal,
  ): Promise<RegisteredBrowserSession>;
}

export interface TildeBrowserSessionRegistryConfig extends RuntimeBootstrapTenant {
  apiKey: string;
  fetch?: typeof fetch;
}

/** Creates `runtime: self_hosted` browser sessions through the Tilde REST API. */
export class TildeBrowserSessionRegistry implements BrowserSessionRegistry {
  readonly tenant: RuntimeBootstrapTenant;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(config: TildeBrowserSessionRegistryConfig) {
    this.tenant = {
      apiBaseUrl: config.apiBaseUrl.replace(/\/$/, ""),
      orgId: config.orgId,
      teamId: config.teamId,
    };
    this.#apiKey = config.apiKey;
    this.#fetch = config.fetch ?? fetch;
  }

  async create(
    request: SelfHostedBrowserSessionRequest,
    signal?: AbortSignal,
  ): Promise<RegisteredBrowserSession> {
    const url = `${this.tenant.apiBaseUrl}/api/v1/team/${encodeURIComponent(
      this.tenant.teamId,
    )}/browser-session`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.#apiKey,
          "x-org-id": this.tenant.orgId,
        },
        body: JSON.stringify(request),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new ConnectError(
        `Tilde browser-session registration failed: ${error instanceof Error ? error.message : String(error)}`,
        Code.Unavailable,
      );
    }
    if (!response.ok)
      throw new ConnectError(
        `Tilde rejected the browser session registration with status ${response.status}`,
        response.status === 401 || response.status === 403
          ? Code.PermissionDenied
          : Code.Unavailable,
      );
    const body: unknown = await response.json().catch(() => undefined);
    if (
      !isRecord(body) ||
      typeof body.id !== "string" ||
      !body.id ||
      typeof body.runtime_token !== "string" ||
      !body.runtime_token
    )
      throw new ConnectError(
        "Tilde returned a browser session without an id and runtime token",
        Code.Internal,
      );
    return { id: body.id, runtime_token: body.runtime_token };
  }
}

/**
 * Reads the Tilde tenant from the computer-service environment. Only the trusted host Computer
 * receives these values; sandboxed Computers report `FailedPrecondition` instead.
 */
export function tildeBrowserSessionRegistryFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): BrowserSessionRegistry {
  const apiKey = environment.TILDE_API_KEY?.trim();
  const orgId = environment.TILDE_ORG_ID?.trim();
  const teamId = environment.TILDE_TEAM_ID?.trim();
  if (!apiKey || !orgId || !teamId)
    throw new ConnectError(
      "Browser sessions require TILDE_API_KEY, TILDE_ORG_ID, and TILDE_TEAM_ID in the computer-service environment",
      Code.FailedPrecondition,
    );
  return new TildeBrowserSessionRegistry({
    apiBaseUrl: environment.TILDE_BASE_URL?.trim() || "https://api.trytilde.ai",
    apiKey,
    orgId,
    teamId,
  });
}

/** Minimal Chrome DevTools Protocol client surface used by the runtime bootstrap. */
export interface CdpTransport {
  call(
    method: string,
    params: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  close(): void;
}

const cdpTimeoutMilliseconds = 20_000;

/** Connects to the browser-level DevTools websocket published on a loopback port. */
export async function connectDevTools(port: number, signal?: AbortSignal): Promise<CdpTransport> {
  const version = await fetch(`http://127.0.0.1:${port}/json/version`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(cdpTimeoutMilliseconds)])
      : AbortSignal.timeout(cdpTimeoutMilliseconds),
  });
  const body: unknown = await version.json();
  if (!isRecord(body) || typeof body.webSocketDebuggerUrl !== "string")
    throw new ConnectError("Chrome did not publish a DevTools websocket URL", Code.Unavailable);
  return await connectDevToolsWebSocket(body.webSocketDebuggerUrl, signal);
}

export function connectDevToolsWebSocket(url: string, signal?: AbortSignal): Promise<CdpTransport> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const waiting = new Map<
      number,
      { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
    >();
    let nextId = 1;
    const fail = (error: Error) => {
      for (const entry of waiting.values()) entry.reject(error);
      waiting.clear();
      reject(error);
    };
    const abort = () => {
      socket.close();
      fail(new ConnectError("DevTools connection aborted", Code.Canceled));
    };
    signal?.addEventListener("abort", abort, { once: true });
    socket.addEventListener("error", () =>
      fail(new ConnectError("DevTools websocket failed", Code.Unavailable)),
    );
    socket.addEventListener("close", () =>
      fail(new ConnectError("DevTools websocket closed", Code.Unavailable)),
    );
    socket.addEventListener("message", (event) => {
      let value: unknown;
      try {
        value = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        return;
      }
      if (!isRecord(value) || typeof value.id !== "number") return;
      const entry = waiting.get(value.id);
      if (!entry) return;
      waiting.delete(value.id);
      if (value.error !== undefined)
        entry.reject(
          new ConnectError(
            `DevTools command failed: ${JSON.stringify(value.error)}`,
            Code.Internal,
          ),
        );
      else entry.resolve(isRecord(value.result) ? value.result : {});
    });
    socket.addEventListener("open", () => {
      resolve({
        call: (method, params, sessionId) =>
          new Promise((resolveCall, rejectCall) => {
            const id = nextId;
            nextId += 1;
            const timer = setTimeout(() => {
              waiting.delete(id);
              rejectCall(new ConnectError(`DevTools ${method} timed out`, Code.DeadlineExceeded));
            }, cdpTimeoutMilliseconds);
            waiting.set(id, {
              resolve: (value) => {
                clearTimeout(timer);
                resolveCall(value);
              },
              reject: (error) => {
                clearTimeout(timer);
                rejectCall(error);
              },
            });
            socket.send(
              JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
            );
          }),
        close: () => {
          signal?.removeEventListener("abort", abort);
          socket.close();
        },
      });
    });
  });
}

export interface RuntimeBootstrapConfig extends RuntimeBootstrapTenant {
  sessionId: string;
  runtimeToken: string;
}

/**
 * JavaScript evaluated inside the extension service worker. It mirrors Tilde's Browserbase
 * bootstrap: the runtime token lives only in the worker's global scope, while the non-secret tenant
 * fields persist to extension storage so a worker restart can reconnect without a new bootstrap.
 */
export function runtimeBootstrapExpression(config: RuntimeBootstrapConfig): string {
  const shared = {
    apiBaseUrl: config.apiBaseUrl,
    orgId: config.orgId,
    teamId: config.teamId,
    sessionId: config.sessionId,
  };
  const secret = JSON.stringify({
    type: "tilde_bootstrap",
    config: { ...shared, runtimeToken: config.runtimeToken },
  });
  const stored = JSON.stringify({ type: "tilde_bootstrap", config: shared });
  return `(async () => { globalThis.__tildeTrustedRuntimeBootstrap = ${secret}; await chrome?.storage?.local?.set?.({ tildeTrustedRuntimeBootstrap: ${stored} }); return await globalThis.__tildeTrustedRuntimeConnect?.(); })()`;
}

/** Target IDs of the trusted-runtime extension's background worker, when Chrome exposes it. */
export function extensionRuntimeTargetIds(targets: Record<string, unknown>): string[] {
  const infos = Array.isArray(targets.targetInfos) ? targets.targetInfos : [];
  const ids: string[] = [];
  for (const info of infos) {
    if (!isRecord(info)) continue;
    const type = typeof info.type === "string" ? info.type : "";
    const url = typeof info.url === "string" ? info.url : "";
    if (
      (type === "service_worker" || type === "background_page") &&
      url.startsWith("chrome-extension://") &&
      url.endsWith("/service_worker.js") &&
      typeof info.targetId === "string"
    )
      ids.push(info.targetId);
  }
  return ids;
}

export interface RuntimeBootstrapResult {
  connected: boolean;
  detail?: string;
}

/**
 * Port of Tilde's `bootstrap_extension_runtime`: wait for the extension worker target, attach, and
 * evaluate the bootstrap so the worker dials its plugin-events websocket with the runtime token.
 */
export async function bootstrapTrustedRuntime(
  cdp: CdpTransport,
  config: RuntimeBootstrapConfig,
  options: { attempts?: number; intervalMilliseconds?: number; signal?: AbortSignal } = {},
): Promise<RuntimeBootstrapResult> {
  const attempts = options.attempts ?? 40;
  let targetIds: string[] = [];
  for (let attempt = 0; attempt < attempts && targetIds.length === 0; attempt += 1) {
    options.signal?.throwIfAborted();
    targetIds = extensionRuntimeTargetIds(await cdp.call("Target.getTargets", {}));
    if (targetIds.length === 0 && attempt + 1 < attempts)
      await delay(options.intervalMilliseconds ?? 250, undefined, { signal: options.signal });
  }
  if (targetIds.length === 0)
    return { connected: false, detail: "trusted-runtime extension worker is not running" };
  const expression = runtimeBootstrapExpression(config);
  let detail = "";
  for (const targetId of targetIds) {
    const attached = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
    if (typeof attached.sessionId !== "string")
      throw new ConnectError("DevTools attach returned no sessionId", Code.Internal);
    const evaluated = await cdp.call(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      attached.sessionId,
    );
    if (evaluated.exceptionDetails !== undefined) {
      detail = JSON.stringify(evaluated.exceptionDetails);
      continue;
    }
    const value = isRecord(evaluated.result) ? evaluated.result.value : undefined;
    if (isRecord(value) && value.connected === true) return { connected: true };
    detail = JSON.stringify(value ?? null);
  }
  return { connected: false, detail: detail || "runtime websocket did not authenticate" };
}

export interface EnsuredBrowserSession {
  browserSessionId: string;
  previewUrl: string;
  remoteDebuggingPort: number;
  runtimeConnected: boolean;
}

interface PersistedBrowserSession {
  id: string;
  runtimeToken: string;
}

export interface BrowserSessionManagerDependencies {
  /** Resolved lazily so an unconfigured tenant fails the request, not service startup. */
  registry: () => BrowserSessionRegistry;
  ensureDesktop: (agentId: string, signal?: AbortSignal) => Promise<AgentDesktop>;
  desktopEnvironment: (agentId: string, desktop: AgentDesktop) => NodeJS.ProcessEnv;
  launchBrowser: (environment: NodeJS.ProcessEnv) => void;
  portListening: (port: number) => Promise<boolean>;
  connectDevTools: (port: number, signal?: AbortSignal) => Promise<CdpTransport>;
  computerId: () => string;
  previewUrl: (agentId: string) => string;
  stateRoot: string;
  browserStartupAttempts?: number;
  bootstrapAttempts?: number;
  intervalMilliseconds?: number;
}

/**
 * Converges one Tilde browser session per agent display. The session is registered once and
 * remembered beside the desktop state; every call re-runs the CDP bootstrap because Chrome keeps the
 * runtime token only in memory, so a restarted browser silently loses its trusted runtime.
 */
export class BrowserSessionManager {
  readonly #dependencies: BrowserSessionManagerDependencies;
  readonly #pending = new Map<string, Promise<EnsuredBrowserSession>>();

  constructor(dependencies: BrowserSessionManagerDependencies) {
    this.#dependencies = dependencies;
  }

  async ensure(agentId: string, signal?: AbortSignal): Promise<EnsuredBrowserSession> {
    validateAgentId(agentId);
    const current = this.#pending.get(agentId);
    if (current) return await current;
    const created = this.#ensureNow(agentId, signal).finally(() => {
      this.#pending.delete(agentId);
    });
    this.#pending.set(agentId, created);
    return await created;
  }

  async #ensureNow(agentId: string, signal?: AbortSignal): Promise<EnsuredBrowserSession> {
    const dependencies = this.#dependencies;
    const desktop = await dependencies.ensureDesktop(agentId, signal);
    const port = remoteDebuggingPort(desktop.display);
    const previewUrl = dependencies.previewUrl(agentId);
    const registry = dependencies.registry();
    const statePath = join(dependencies.stateRoot, agentId, "browser-session.json");
    let session = await readPersistedSession(statePath);
    if (!session) {
      const registered = await registry.create(
        {
          runtime: "self_hosted",
          computer_id: dependencies.computerId(),
          agent_id: agentId,
          preview_url: previewUrl,
        },
        signal,
      );
      session = { id: registered.id, runtimeToken: registered.runtime_token };
      await persistSession(statePath, session);
    }

    if (!(await dependencies.portListening(port))) {
      dependencies.launchBrowser(dependencies.desktopEnvironment(agentId, desktop));
      const attempts = dependencies.browserStartupAttempts ?? 80;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        signal?.throwIfAborted();
        if (await dependencies.portListening(port)) break;
        await delay(dependencies.intervalMilliseconds ?? 250, undefined, { signal });
      }
      if (!(await dependencies.portListening(port)))
        throw new ConnectError(
          `Chrome for ${agentId} did not publish DevTools on port ${port}`,
          Code.Unavailable,
        );
    }

    let runtimeConnected = false;
    const cdp = await dependencies.connectDevTools(port, signal);
    try {
      const result = await bootstrapTrustedRuntime(
        cdp,
        { ...registry.tenant, sessionId: session.id, runtimeToken: session.runtimeToken },
        {
          attempts: dependencies.bootstrapAttempts,
          intervalMilliseconds: dependencies.intervalMilliseconds,
          signal,
        },
      );
      runtimeConnected = result.connected;
      if (!result.connected)
        console.warn("[openbot-browser] trusted runtime bootstrap incomplete", {
          agentId,
          detail: result.detail,
        });
    } finally {
      cdp.close();
    }
    return {
      browserSessionId: session.id,
      previewUrl,
      remoteDebuggingPort: port,
      runtimeConnected,
    };
  }
}

export function createBrowserSessionManager(
  overrides: Partial<BrowserSessionManagerDependencies> = {},
): BrowserSessionManager {
  return new BrowserSessionManager({
    registry: () => tildeBrowserSessionRegistryFromEnvironment(),
    ensureDesktop: (agentId, signal) => ensureAgentDesktop(agentId, undefined, signal),
    desktopEnvironment: agentDesktopEnvironment,
    launchBrowser: launchBrowserProcess,
    portListening,
    connectDevTools,
    computerId: () => process.env.COMPUTER_ID?.trim() || "openbot-computer",
    previewUrl: ownerPreviewUrl,
    stateRoot: process.env.COMPUTER_DESKTOP_ROOT ?? "/workspace/.openbot/desktops",
    ...overrides,
  });
}

/** Owner-facing preview route served by the control service; empty when no public origin is known. */
export function ownerPreviewUrl(
  agentId: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const origin = environment.COMPUTER_PREVIEW_ORIGIN?.trim();
  if (!origin) return "";
  return new URL(`/api/computer/${encodeURIComponent(agentId)}/preview`, `${origin}/`).toString();
}

function launchBrowserProcess(environment: NodeJS.ProcessEnv): void {
  const launcher = process.env.COMPUTER_BROWSER_LAUNCHER ?? "/usr/local/bin/openbot-browser";
  const child = spawn(launcher, [], {
    detached: true,
    env: { ...process.env, ...environment },
    stdio: "ignore",
  });
  child.once("error", () => undefined);
  child.unref();
}

function portListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (ready: boolean) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function readPersistedSession(path: string): Promise<PersistedBrowserSession | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      isRecord(value) &&
      typeof value.id === "string" &&
      value.id &&
      typeof value.runtimeToken === "string" &&
      value.runtimeToken
    )
      return { id: value.id, runtimeToken: value.runtimeToken };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
  }
  return undefined;
}

async function persistSession(path: string, session: PersistedBrowserSession): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(session)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function validateAgentId(agentId: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId))
    throw new ConnectError("A valid agent_id is required", Code.InvalidArgument);
}
