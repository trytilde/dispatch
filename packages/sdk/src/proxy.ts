/** Server-side, session-authorized transport for Tilde runtime routes. */
export interface ProxySession {
  identityId: string;
  teamIds: readonly string[];
}

export interface TildeProxyOptions {
  baseUrl: string;
  orgId: string;
  proxyToken: string;
  /** Must authenticate the request; never derive identity from caller-supplied IDs. */
  resolveSession(this: void, request: Request): Promise<ProxySession | null>;
  /** Same-origin mount prefix, excluding the upstream /api/v1 path. */
  mountPath?: string;
  fetch?: typeof fetch;
}

const requestHeaders = new Set([
  "accept",
  "accept-language",
  "content-type",
  "content-length",
  "if-match",
  "if-none-match",
  "range",
  "last-event-id",
  "idempotency-key",
]);
const responseHeaders = new Set([
  "content-type",
  "content-disposition",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "retry-after",
  "x-vercel-ai-ui-message-stream",
  "x-vercel-ai-data-stream",
]);
const runtimeDomains = new Set([
  "chatkit",
  "mcp",
  "memory",
  "wiki",
  "skills",
  "signals",
  "routines",
  "credential",
  "managed-credential",
  "reverse-proxy",
  "provider-setup",
  "browser",
  "browser-password-manager",
  "tools",
  "wikis",
  "automations",
  "managed-user-credential",
  "credential-source",
]);

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Build one reusable proxy handler. All identity and tenant state is request-local.
 * Administrative and account routes are intentionally absent from the runtime surface.
 */
export function createTildeProxy(
  options: TildeProxyOptions,
): (request: Request) => Promise<Response> {
  if ("window" in globalThis) throw new Error("Tilde proxy is server-only");
  const origin = new URL(options.baseUrl);
  if (
    !/^https?:$/.test(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new TypeError(
      "baseUrl must be an HTTP(S) origin without credentials, query, or fragment",
    );
  }
  if (!options.orgId || !options.proxyToken)
    throw new TypeError("orgId and proxyToken are required");
  const { orgId, proxyToken, resolveSession } = options;
  const mount = (options.mountPath ?? "").replace(/\/$/, "");
  const send = options.fetch ?? globalThis.fetch;
  return async (request) => {
    const incoming = new URL(request.url);
    if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      return jsonError(405, "Method not allowed");
    }
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers.get("origin") !== incoming.origin
    ) {
      return jsonError(403, "A same-origin request is required");
    }
    if (mount && !incoming.pathname.startsWith(`${mount}/`))
      return jsonError(404, "Route not found");
    const path = incoming.pathname.slice(mount.length);
    if (
      (request.method === "POST" && /\/chatkit\/agents\/http-vercel-ai-sdk$/.test(path)) ||
      /\/chatkit\/(?:agents\/[^/]+\/provision|self-extension-proposals\/[^/]+\/outputs\/claim)(?:\/|$)/.test(
        path,
      )
    ) {
      return jsonError(404, "Credential provisioning is not a browser runtime operation");
    }
    // Reject encoded separators and dot segments before interpreting security-sensitive paths.
    if (/%(?:2f|5c|2e|25)/i.test(path) || path.includes("\\"))
      return jsonError(400, "Invalid path");
    const teamRoute = /^\/api\/v1\/team\/([^/]+)\/([^/]+)(?:\/|$)/.exec(path);
    const personalRoute =
      /^\/api\/v1\/(?:identity|user)\/([^/]+)\/(?:links|identities|profile|memory|wiki|wikis|skills|mcp|routines|credential)(?:\/|$)/.exec(
        path,
      );
    const realtimeTicket =
      teamRoute?.[2] === "identity" && path.endsWith("/identity/realtime-ticket");
    const instanceRead =
      request.method === "GET" &&
      teamRoute?.[2] === "identity" &&
      /\/identity\/openbot\/instances(?:\/[^/]+)?$/.test(path);
    const chatUiRoute =
      /^\/api\/v1\/team\/[^/]+\/inbox\/(?:session\/[^/]+\/inbox\/[^/]+\/instance\/[^/]+|inbox\/[^/]+)\/ai\/ui(?:\/stream)?$/.test(
        path,
      );
    if (
      !personalRoute &&
      (!teamRoute ||
        (!runtimeDomains.has(teamRoute[2]!) && !realtimeTicket && !instanceRead && !chatUiRoute))
    ) {
      return jsonError(404, "Route not available through the runtime proxy");
    }
    const session = await resolveSession(request);
    if (!session) return jsonError(401, "Authentication required");
    if (teamRoute && !session.teamIds.includes(decodeURIComponent(teamRoute[1]!))) {
      return jsonError(403, "Team access denied");
    }
    if (personalRoute && decodeURIComponent(personalRoute[1]!) !== session.identityId) {
      return jsonError(403, "Identity access denied");
    }
    const headers = new Headers();
    request.headers.forEach((value, name) => {
      if (requestHeaders.has(name)) headers.set(name, value);
    });
    headers.set("x-tilde-org-id", orgId);
    headers.set("x-tilde-proxy-token", proxyToken);
    headers.set("x-tilde-identity-id", session.identityId);
    const target = new URL(path + incoming.search, origin.origin);
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      signal: request.signal,
      redirect: "manual",
      cache: "no-store",
    };
    if (request.body && !["GET", "HEAD"].includes(request.method)) {
      init.body = request.body;
      init.duplex = "half";
    }
    let upstream: Response;
    try {
      upstream = await send(target, init);
    } catch (error) {
      if (request.signal.aborted) throw error;
      return jsonError(502, "Tilde could not be reached");
    }
    // Never follow an upstream redirect with the application credential or expose a login callback.
    if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) {
      await upstream.body?.cancel();
      return jsonError(502, "Unexpected upstream redirect");
    }
    const forwarded = new Headers({
      "cache-control": "no-store",
      // Runtime resources can include uploaded HTML/SVG or arbitrary upstream
      // bytes. A navigation must never execute them with the application's origin.
      "content-security-policy": "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
      "x-content-type-options": "nosniff",
    });
    upstream.headers.forEach((value, name) => {
      if (responseHeaders.has(name)) forwarded.set(name, value);
    });
    // Fetch decompresses the body; an encoded response's length no longer describes its bytes.
    if (upstream.headers.has("content-encoding")) forwarded.delete("content-length");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: forwarded,
    });
  };
}
