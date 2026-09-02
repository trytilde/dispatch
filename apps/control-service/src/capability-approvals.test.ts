import { describe, expect, it, vi } from "vite-plus/test";
import type { AuthProvider } from "@tryopenbot/auth-provider";
import { createApp } from "./app.js";

function testAuthProvider(): AuthProvider {
  return {
    initialization: { id: "test-auth", label: "Test auth", questions: [] },
    deployable: { plan: async () => ({ summary: "test" }), deploy: async () => ({}) },
    nativeClientConfiguration: () => ({
      authorizationEndpoint: "https://identity.test/authorize",
      tokenEndpoint: "https://identity.test/token",
      clientId: "client-one",
      scope: "openid offline_access openbot:control",
    }),
    authorizationUrl: () => new URL("https://identity.test/authorize"),
    exchangeCode: async () => ({ accessToken: "human-token", expiresIn: 3600 }),
    refresh: async () => ({ accessToken: "human-token", expiresIn: 3600 }),
    verify: async () => ({ subject: "owner-one", groups: [], scope: ["openbot:control"] }),
  } as unknown as AuthProvider;
}

describe("capability approval proxy", () => {
  it("forwards the authenticated human bearer and exact binding", async () => {
    const upstream = vi.fn(async (_input: URL | string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer human-token");
      expect(JSON.parse(expectStringBody(init?.body))).toEqual({
        approval_id: "approval-a",
        proposal_hash: "hash-a",
        proposal_generation: 1,
        decision: "approve",
      });
      return Response.json({
        id: "proposal-a",
        title: "Add Stripe",
        rationale: "Revenue",
        category: "connector",
        preview: {
          permissions: [],
          credentials: [],
          cost_summary: "$0",
          security_summary: "Read-only",
          rollback_plan: "Remove",
        },
        approval: {
          approval_id: "approval-a",
          proposal_id: "proposal-a",
          proposal_hash: "hash-a",
          proposal_generation: 1,
          status: "completed",
          title: "Add Stripe",
          instructions: "Revenue",
        },
      });
    });
    const app = createApp({
      authProvider: testAuthProvider(),
      tildeProxy: {
        apiKey: "machine",
        orgId: "org",
        teamId: "team",
        baseUrl: "https://tilde.test",
        fetch: upstream as typeof fetch,
      },
    });
    const response = await app.request(
      "https://openbot.test/api/capability-approvals/proposal-a/decision",
      {
        method: "POST",
        headers: { authorization: "Bearer human-token", "content-type": "application/json" },
        body: JSON.stringify({
          approval_id: "approval-a",
          proposal_hash: "hash-a",
          proposal_generation: 1,
          decision: "approve",
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("does not accept a machine key in place of an owner bearer", async () => {
    const upstream = vi.fn();
    const app = createApp({
      authProvider: testAuthProvider(),
      tildeProxy: {
        apiKey: "machine",
        orgId: "org",
        teamId: "team",
        baseUrl: "https://tilde.test",
        fetch: upstream,
      },
    });
    const response = await app.request(
      "https://openbot.test/api/capability-approvals/proposal-a/decision",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approval_id: "approval-a",
          proposal_hash: "hash-a",
          proposal_generation: 1,
          decision: "approve",
        }),
      },
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

function expectStringBody(body: unknown): string {
  expect(typeof body).toBe("string");
  return body as string;
}
