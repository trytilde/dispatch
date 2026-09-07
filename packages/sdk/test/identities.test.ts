import { describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../src/client";

describe("application identity client", () => {
  it("cannot silently turn an identity-bound runtime client into application administration", async () => {
    const send = vi.fn<typeof fetch>();
    const application = createClient({
      baseUrl: "https://api.tilde.test",
      orgSubdomain: false,
      orgId: "org-a",
      proxyToken: "server-only",
      fetch: send,
    });
    const alice = application.forTeam({ teamId: "team-a", identityId: "alice" });
    const bob = application.forTeam({ teamId: "team-b", identityId: "bob" });
    await expect(alice.createIdentity({})).rejects.toThrow("unbound application client");
    await expect(bob.identities.update("alice", { disabled: true })).rejects.toThrow(
      "unbound application client",
    );
    expect(send).not.toHaveBeenCalled();
    expect(application.config.identityId).toBeUndefined();
    expect(alice.config.identityId).toBe("alice");
    expect(bob.config.identityId).toBe("bob");
  });

  it("uses explicit application authority for identity lifecycle operations", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ id: "alice", org_id: "org-a", disabled: true, identifiers: [] }),
      );
    const application = createClient({
      baseUrl: "https://api.tilde.test",
      orgSubdomain: false,
      orgId: "org-a",
      proxyToken: "server-only",
      fetch: send,
    });
    await application.identities.update("alice", { disabled: true });
    const [url, init] = send.mock.calls[0]!;
    expect(url instanceof Request ? url.url : url.toString()).toBe(
      "https://api.tilde.test/api/v1/identity/identities/alice",
    );
    expect(init?.method).toBe("PATCH");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-tilde-org-id")).toBe("org-a");
    expect(headers.get("x-tilde-proxy-token")).toBe("server-only");
    expect(headers.has("x-tilde-identity-id")).toBe(false);
    expect(JSON.parse(init?.body as string)).toEqual({ disabled: true, identifiers: [] });
  });

  it("manages only runtime memberships and identifiers through explicit application routes", async () => {
    const membership = { identity_id: "alice", org_id: "org-a", team_id: "team-b", role: "member" };
    const identity = { id: "alice", org_id: "org-a", identifiers: [] };
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [membership], next_page_token: null }))
      .mockResolvedValueOnce(Response.json(membership))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(identity));
    const client = createClient({
      baseUrl: "https://api.tilde.test",
      orgSubdomain: false,
      orgId: "org-a",
      proxyToken: "server-only",
      fetch: send,
    });
    expect(await client.identities.listTeams("alice", { pageSize: 100 })).toEqual({
      items: [membership],
      next_page_token: null,
    });
    expect(await client.identities.addTeam("alice", "team-b")).toEqual(membership);
    expect(await client.identities.removeTeam("alice", "team-b")).toBeUndefined();
    expect(
      await client.identities.removeIdentifier("alice", { namespace: "crm", value: "record-one" }),
    ).toEqual(identity);
    expect(
      send.mock.calls.map(([url, init]) => [
        url instanceof Request ? url.url : url.toString(),
        init?.method,
      ]),
    ).toEqual([
      ["https://api.tilde.test/api/v1/identity/identities/alice/teams?page_size=100", "GET"],
      ["https://api.tilde.test/api/v1/identity/identities/alice/teams/team-b", "PUT"],
      ["https://api.tilde.test/api/v1/identity/identities/alice/teams/team-b", "DELETE"],
      ["https://api.tilde.test/api/v1/identity/identities/alice/identifiers", "DELETE"],
    ]);
    expect(send.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(JSON.parse(send.mock.calls[3]?.[1]?.body as string)).toEqual({
      namespace: "crm",
      value: "record-one",
    });
  });

  it("rejects bound clients and invalid pagination for membership management", async () => {
    const send = vi.fn<typeof fetch>();
    const app = createClient({
      baseUrl: "https://api.tilde.test",
      orgSubdomain: false,
      orgId: "org-a",
      proxyToken: "secret",
      fetch: send,
    });
    const bound = app.forTeam({ identityId: "alice", teamId: "team-a" });
    await expect(bound.identities.listTeams("alice")).rejects.toThrow("unbound");
    await expect(bound.identities.addTeam("alice", "team-b")).rejects.toThrow("unbound");
    await expect(bound.identities.removeTeam("alice", "team-b")).rejects.toThrow("unbound");
    await expect(
      bound.identities.removeIdentifier("alice", { namespace: "crm", value: "one" }),
    ).rejects.toThrow("unbound");
    await expect(app.identities.listTeams("alice", { pageSize: NaN })).rejects.toThrow("pageSize");
    expect(send).not.toHaveBeenCalled();
  });
  it("round-trips opaque cursors and clamps page sizes on both list routes", async () => {
    const cursor = "time+id/with=padding";
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ items: [], next_page_token: cursor }));
    const app = createClient({
      baseUrl: "https://api.tilde.test",
      orgSubdomain: false,
      orgId: "org-a",
      proxyToken: "secret",
      fetch: send,
    });
    const page = await app.identities.list({ pageSize: 500 });
    await app.identities.listTeams("alice/a", {
      pageSize: 0,
      nextPageToken: page.next_page_token!,
    });
    const urls = send.mock.calls.map(
      ([url]) => new URL(url instanceof Request ? url.url : url.toString()),
    );
    expect(urls[0]!.searchParams.get("page_size")).toBe("100");
    expect(urls[1]!.pathname).toContain("alice%2Fa/teams");
    expect(urls[1]!.searchParams.get("page_size")).toBe("1");
    expect(urls[1]!.searchParams.get("next_page_token")).toBe(cursor);
  });
});
