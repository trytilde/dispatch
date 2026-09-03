import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TildePlatform } from "@trytilde/dispatch-platform-integrations";
import { DeploymentOutputs } from "@trytilde/dispatch-runtime-provider";
import { TildeAuthProvider } from "./tilde.js";

const environment = {
  DISPATCH_OIDC_CLIENT_ID: "client-one",
  DISPATCH_OIDC_AUDIENCE: "urn:tilde:dispatch:client-one",
  DISPATCH_OIDC_ISSUER: "https://team.api.trytilde.ai/api/v1/team/team-one/identity/oauth",
  DISPATCH_OIDC_SCOPE: "openid dispatch:control",
  DISPATCH_OIDC_AUTHORIZATION_ENDPOINT: "https://api.trytilde.ai/api/v1/identity/oauth/authorize",
  DISPATCH_OIDC_TOKEN_ENDPOINT: "https://api.trytilde.ai/api/v1/identity/oauth/token",
  DISPATCH_OIDC_JWKS_URI: "https://api.trytilde.ai/api/v1/identity/.well-known/jwks.json",
};

afterEach(() => vi.useRealTimers());

describe("TildeAuthProvider", () => {
  it("exposes only public native OAuth configuration", () => {
    expect(providerWith({ request: fetch, environment }).nativeClientConfiguration()).toEqual({
      authorizationEndpoint: environment.DISPATCH_OIDC_AUTHORIZATION_ENDPOINT,
      tokenEndpoint: environment.DISPATCH_OIDC_TOKEN_ENDPOINT,
      clientId: environment.DISPATCH_OIDC_CLIENT_ID,
      scope: environment.DISPATCH_OIDC_SCOPE,
    });
  });

  it("verifies the issuer, audience, authorized party, token type, and scope", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ keys: [{ ...jwk, kid: "key-one", alg: "RS256" }] }),
    );
    const provider = providerWith({ request, environment });
    const token = jwt(privateKey, {
      sub: "human-one",
      email: "owner@example.com",
      groups: ["team-member"],
      scope: "openid dispatch:control",
      iss: environment.DISPATCH_OIDC_ISSUER,
      aud: environment.DISPATCH_OIDC_AUDIENCE,
      azp: environment.DISPATCH_OIDC_CLIENT_ID,
      typ: "tilde:dispatch",
      exp: Math.floor(Date.now() / 1000) + 300,
      nbf: Math.floor(Date.now() / 1000) - 1,
    });
    await expect(provider.verify(token)).resolves.toMatchObject({
      subject: "human-one",
      email: "owner@example.com",
    });
    const wrongAudience = jwt(privateKey, {
      sub: "human-one",
      scope: "dispatch:control",
      iss: environment.DISPATCH_OIDC_ISSUER,
      aud: "urn:tilde:dispatch:other",
      azp: environment.DISPATCH_OIDC_CLIENT_ID,
      typ: "tilde:dispatch",
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    await expect(provider.verify(wrongAudience)).rejects.toThrow("not valid for this Dispatch");
  });

  it("loads the signed-in account and selected workspace from whoami", async () => {
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(url).toBe("https://api.trytilde.ai/api/v1/identity/auth/whoami");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer owner-token");
      return Response.json({
        identity: { type: "human", sub: "human-one", email: "owner@example.com" },
        organizations: [{ organization_id: "org-one", name: "Tilde", role: "owner" }],
        teams: [{ team_id: "team-one", org_id: "org-one", name: "Dispatch", role: "owner" }],
        groups: [],
      });
    });

    await expect(
      providerWith({ request, environment }).account("owner-token", {
        subject: "human-one",
        email: "token@example.com",
        groups: [],
        scope: ["dispatch:control"],
      }),
    ).resolves.toEqual({
      name: "owner@example.com",
      email: "owner@example.com",
      organization: { id: "org-one", name: "Tilde", role: "owner" },
      workspace: { id: "team-one", name: "Dispatch", role: "owner" },
    });
  });

  it("registers once during init and persists public OIDC metadata", async () => {
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.headers).toMatchObject({ "x-api-key": "tilde-key" });
      expect(JSON.parse(typeof init?.body === "string" ? init.body : "{}")).toMatchObject({
        name: "My Dispatch",
        redirect_uris: expect.arrayContaining(["dispatch://auth/callback"]),
      });
      return Response.json({
        client_id: "client-one",
        audience: "urn:tilde:dispatch:client-one",
        issuer: environment.DISPATCH_OIDC_ISSUER,
        scope: environment.DISPATCH_OIDC_SCOPE,
        authorization_endpoint: environment.DISPATCH_OIDC_AUTHORIZATION_ENDPOINT,
        token_endpoint: environment.DISPATCH_OIDC_TOKEN_ENDPOINT,
        jwks_uri: environment.DISPATCH_OIDC_JWKS_URI,
      });
    });
    const setEnvironment = vi.fn(async () => undefined);
    await providerWith({ request, environment: {} }).initialize({
      repositoryRoot: "/repo",
      environment: {
        TILDE_API_KEY: "tilde-key",
        TILDE_ORG_ID: "org-one",
        TILDE_TEAM_ID: "team-one",
        TILDE_BASE_URL: "https://api.trytilde.ai",
        DISPATCH_DEPLOYMENT_NAME: "My Dispatch",
      },
      request,
      setEnvironment,
      setSecret: async () => undefined,
    });
    expect(setEnvironment).toHaveBeenCalledWith(
      "DISPATCH_OIDC_AUDIENCE",
      environment.DISPATCH_OIDC_AUDIENCE,
      expect.any(String),
    );
  });

  it("reconciles both local web callback hosts during development", async () => {
    let registration: { redirect_uris?: string[]; deployment_url?: string } = {};
    const request = vi.fn<typeof fetch>(async (_input, init) => {
      registration = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
      return Response.json({
        client_id: "client-one",
        audience: "urn:tilde:dispatch:client-one",
        issuer: environment.DISPATCH_OIDC_ISSUER,
        scope: environment.DISPATCH_OIDC_SCOPE,
        authorization_endpoint: environment.DISPATCH_OIDC_AUTHORIZATION_ENDPOINT,
        token_endpoint: environment.DISPATCH_OIDC_TOKEN_ENDPOINT,
        jwks_uri: environment.DISPATCH_OIDC_JWKS_URI,
      });
    });
    const developmentEnvironment = {
      ...environment,
      TILDE_API_KEY: "tilde-key",
      TILDE_ORG_ID: "org-one",
      TILDE_TEAM_ID: "team-one",
      PUBLIC_ORIGIN: "https://our-dispatch-control.vercel.app",
      PORT: "4100",
      WEB_PORT: "4173",
    };

    await providerWith({ request, environment: developmentEnvironment }).configure({
      devMode: true,
      repositoryRoot: "/repo",
      environment: developmentEnvironment,
      inputs: new DeploymentOutputs(),
      report: vi.fn(),
    });

    expect(registration.redirect_uris).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:4173/auth/callback",
        "http://localhost:4173/auth/callback",
        "http://[::1]:4173/auth/callback",
        "https://our-dispatch-control.vercel.app/auth/callback",
      ]),
    );
    expect(registration.deployment_url).toBe("https://our-dispatch-control.vercel.app");
  });

  it("refreshes cached signing keys once when a new kid appears", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    const first = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const second = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          keys: [{ ...first.publicKey.export({ format: "jwk" }), kid: "key-one" }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          keys: [{ ...second.publicKey.export({ format: "jwk" }), kid: "key-two" }],
        }),
      );
    const provider = providerWith({ request, environment });
    const claims = {
      sub: "human-one",
      scope: "dispatch:control",
      iss: environment.DISPATCH_OIDC_ISSUER,
      aud: environment.DISPATCH_OIDC_AUDIENCE,
      azp: environment.DISPATCH_OIDC_CLIENT_ID,
      typ: "tilde:dispatch",
      exp: Math.floor(Date.now() / 1000) + 300,
    };

    await expect(provider.verify(jwt(first.privateKey, claims))).resolves.toBeDefined();
    vi.advanceTimersByTime(30_001);
    await expect(provider.verify(jwt(second.privateKey, claims, "key-two"))).resolves.toBeDefined();
    expect(request).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

function providerWith(options: { request: typeof fetch; environment: NodeJS.ProcessEnv }) {
  return new TildeAuthProvider(
    new TildePlatform({ apiKey: "tilde-key", orgId: "org-one", teamId: "team-one" }),
    options,
  );
}

function jwt(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  claims: object,
  kid = "key-one",
) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString(
    "base64url",
  );
  return `${header}.${payload}.${signature}`;
}
