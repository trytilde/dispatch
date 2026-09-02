import type { Hono } from "hono";
import type { TildeProxyOptions } from "./tilde-proxy.js";

/** Register the owner-only proxy for exact capability-change decisions. */
export function registerCapabilityApprovalRoutes(app: Hono, configured?: TildeProxyOptions): void {
  app.post("/api/capability-approvals/:proposalId/decision", async (context) => {
    const options = configured ?? optionsFromEnvironment();
    if (!options)
      return context.json({ error: "Tilde capability approvals are not configured" }, 503);
    const { ownerAccessToken: accessToken } = context.var as { ownerAccessToken?: string };
    if (!accessToken) return context.json({ error: "Authentication required" }, 401);
    const body = await context.req.json().catch(() => undefined);
    if (!validBody(body)) return context.json({ error: "Invalid capability decision" }, 400);
    const url = new URL(
      `/api/v1/team/${encodeURIComponent(options.teamId)}/chatkit/self-extension-proposals/${encodeURIComponent(context.req.param("proposalId"))}/decision`,
      options.baseUrl ?? "https://api.trytilde.ai",
    );
    const response = await (options.fetch ?? fetch)(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "x-tilde-org-id": options.orgId,
        "x-tilde-team-id": options.teamId,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    context.header("content-type", response.headers.get("content-type") ?? "application/json");
    return context.body(text, response.status as 200);
  });
}

function validBody(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.approval_id === "string" &&
    body.approval_id.length > 0 &&
    typeof body.proposal_hash === "string" &&
    body.proposal_hash.length > 0 &&
    Number.isSafeInteger(body.proposal_generation) &&
    (body.decision === "approve" || body.decision === "reject")
  );
}

function optionsFromEnvironment(): TildeProxyOptions | undefined {
  const apiKey = process.env.TILDE_API_KEY?.trim();
  const orgId = process.env.TILDE_ORG_ID?.trim();
  const teamId = process.env.TILDE_TEAM_ID?.trim();
  if (!apiKey || !orgId || !teamId) return;
  return { apiKey, orgId, teamId, baseUrl: process.env.TILDE_BASE_URL };
}
