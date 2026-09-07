import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createClient, createTildeGrpcReverseProxy } from "../src";
import { configFetch, configHeaders } from "../src/config";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  return `http://127.0.0.1:${address.port}`;
}
const clientFor = (baseUrl: string) =>
  createClient({
    baseUrl,
    orgSubdomain: false,
    orgId: "org-one",
    proxyToken: "application-secret",
    identityId: "alice",
    teamId: "team-one",
  });

describe("application credential transport", () => {
  it("does not follow real redirects from handwritten or generated requests", async () => {
    let leakedRequests = 0;
    const destination = await listen(
      createServer((_request, response) => {
        leakedRequests++;
        response.end("{}");
      }),
    );
    let authenticatedRequests = 0;
    const upstream = await listen(
      createServer((request, response) => {
        if (request.headers["x-tilde-proxy-token"] === "application-secret")
          authenticatedRequests++;
        response.writeHead(307, { location: destination });
        response.end();
      }),
    );
    const client = clientFor(upstream);
    await expect(client.chatkit.getAgentMemorySettings("agent")).rejects.toThrow();
    await expect(client.skills.package("skill").manifest()).rejects.toThrow();
    expect(authenticatedRequests).toBe(2);
    expect(leakedRequests).toBe(0);
  });

  it("rejects a credential-bearing generated Request to a different origin", async () => {
    const client = clientFor("https://tilde.test");
    const request = new Request("https://other.test/", { headers: configHeaders(client.config) });
    await expect(configFetch(client.config)(request)).rejects.toThrow("configured Tilde origin");
  });

  it("snapshots mutable config headers and freezes per-request bindings", () => {
    const headers = new Headers({ "x-request-id": "original" });
    const client = createClient({ ...clientFor("https://tilde.test").config, headers });
    const second = client.forTeam({ teamId: "team-two", identityId: "bob" });
    headers.set("x-request-id", "mutated");
    expect(new Headers(client.config.headers).get("x-request-id")).toBe("original");
    expect(() => Object.assign(client.config, { identityId: "mallory" })).toThrow();
    expect(() => Object.assign(client.config.headers!, { "x-request-id": "mutated" })).toThrow();
    expect(client.config.identityId).toBe("alice");
    expect(second.config.identityId).toBe("bob");
    expect(second.config.teamId).toBe("team-two");
  });

  it("fails explicitly for gRPC instead of silently using metadata credentials", () => {
    expect(() =>
      createTildeGrpcReverseProxy({ client: clientFor("https://tilde.test"), profileId: "proxy" }),
    ).toThrow("supported over HTTP");
  });
});
