import { describe, expect, it, vi } from "vite-plus/test";
import { createTildeProxy } from "../src/proxy";

const endpoint = "https://heyash.test/api/tilde/api/v1/team/team-a/chatkit/sessions";
function setup(overrides: Partial<Parameters<typeof createTildeProxy>[0]> = {}) {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("streamed", {
      headers: { "content-type": "text/event-stream", "set-cookie": "secret=1" },
    }),
  );
  return {
    upstream,
    handle: createTildeProxy({
      baseUrl: "https://api.tilde.test",
      orgId: "org-ash",
      proxyToken: "server-secret",
      mountPath: "/api/tilde",
      fetch: upstream,
      resolveSession: async () => ({ identityId: "alice", teamIds: ["team-a"] }),
      ...overrides,
    }),
  };
}

describe("session-authorized runtime proxy", () => {
  it("replaces hostile identity/credential headers and preserves streamed responses", async () => {
    const { upstream, handle } = setup();
    const response = await handle(
      new Request(endpoint, {
        headers: {
          "x-tilde-org-id": "other-org",
          "x-tilde-identity-id": "bob",
          "x-tilde-proxy-token": "attacker",
          authorization: "Bearer attacker",
          cookie: "clerk=secret",
        },
      }),
    );
    expect(await response.text()).toBe("streamed");
    const [url, init] = upstream.mock.calls[0]!;
    expect(url instanceof Request ? url.url : url.toString()).toBe(
      "https://api.tilde.test/api/v1/team/team-a/chatkit/sessions",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("x-tilde-org-id")).toBe("org-ash");
    expect(headers.get("x-tilde-identity-id")).toBe("alice");
    expect(headers.get("x-tilde-proxy-token")).toBe("server-secret");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("denies another team before making an upstream request", async () => {
    const { upstream, handle } = setup();
    expect((await handle(new Request(endpoint.replace("team-a", "team-b")))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("isolates active content returned by runtime resources from the app origin", async () => {
    const { upstream, handle } = setup();
    upstream.mockResolvedValue(
      new Response("<script>fetch('/api/ash/account-link')</script>", {
        headers: {
          "content-type": "text/html",
          "content-security-policy": "default-src * 'unsafe-inline'",
        },
      }),
    );
    const response = await handle(new Request(endpoint));
    expect(response.headers.get("content-security-policy")).toBe(
      "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-type")).toBe("text/html");
  });

  it.each([
    "team/team-a/inbox/inbox/channel/webhook",
    "team/team-a/inbox/session/session/inbox/channel/instance/instance/ai/ui/stream/extra",
    "identity/proxy-tokens",
    "billing/context",
    "identity/identities",
    "team/team-a/identity/api-keys",
    "team/team-a/chatkit/agents/guide/provision",
    "team/team-a/chatkit/agents/guide/provision/outputs/claim",
    "team/team-a/chatkit/self-extension-proposals/proposal/outputs/claim",
  ])("does not expose control route %s", async (path) => {
    const { upstream, handle } = setup();
    expect((await handle(new Request(`https://heyash.test/api/tilde/api/v1/${path}`))).status).toBe(
      404,
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated sessions and cross-origin mutations", async () => {
    const { handle, upstream } = setup({ resolveSession: async () => null });
    expect((await handle(new Request(endpoint))).status).toBe(401);
    expect(
      (
        await handle(
          new Request(endpoint, { method: "POST", headers: { origin: "https://attacker.test" } }),
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("does not follow redirects or expose upstream locations", async () => {
    const { upstream, handle } = setup();
    upstream.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://attacker.test" } }),
    );
    const response = await handle(new Request(endpoint));
    expect(response.status).toBe(502);
    expect(response.headers.has("location")).toBe(false);
    expect(upstream.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("keeps concurrent session identities separate", async () => {
    const { upstream, handle } = setup({
      resolveSession: async (request) => ({
        identityId: new URL(request.url).searchParams.get("session")!,
        teamIds: ["team-a"],
      }),
    });
    upstream.mockImplementation(async () => new Response("ok"));
    await Promise.all([
      handle(new Request(`${endpoint}?session=alice`)),
      handle(new Request(`${endpoint}?session=bob`)),
    ]);
    expect(
      upstream.mock.calls
        .map(([, init]) => new Headers(init?.headers).get("x-tilde-identity-id"))
        .sort((left, right) => (left ?? "").localeCompare(right ?? "")),
    ).toEqual(["alice", "bob"]);
  });
});

describe("frontend chat UI transport", () => {
  it.each([
    "inbox/session/session/inbox/channel/instance/instance/ai/ui/stream",
    "inbox/inbox/channel/ai/ui/stream",
  ])("preserves the caller and streaming protocol for %s", async (path) => {
    const { handle, upstream } = setup();
    upstream.mockResolvedValue(
      new Response("data: [DONE]\n\n", {
        headers: { "x-vercel-ai-ui-message-stream": "v1", "content-type": "text/event-stream" },
      }),
    );
    const response = await handle(
      new Request(`https://heyash.test/api/tilde/api/v1/team/team-a/${path}`, {
        method: "POST",
        headers: { origin: "https://heyash.test" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(new Headers(upstream.mock.calls[0]?.[1]?.headers).get("x-tilde-identity-id")).toBe(
      "alice",
    );
    expect(await response.text()).toBe("data: [DONE]\n\n");
  });
});

it("does not forward durable agent credential registration from a runtime session", async () => {
  const { handle, upstream } = setup();
  const response = await handle(
    new Request(
      "https://heyash.test/api/tilde/api/v1/team/team-a/chatkit/agents/http-vercel-ai-sdk",
      { method: "POST", headers: { origin: "https://heyash.test" }, body: "{}" },
    ),
  );
  expect(response.status).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
