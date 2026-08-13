import type { DeploymentProvider, ProviderCallContext } from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";

export class VercelDeploymentProvider implements DeploymentProvider {
  readonly descriptor = {
    id: "vercel",
    version: "1.0.0",
    displayName: "Vercel deployments",
    kind: "deployment" as const,
    capabilities: ["deployment-status"] as const,
  };

  constructor(private readonly options: { token: string; projectId: string; teamId?: string }) {}

  async health(context: ProviderCallContext) {
    try {
      await this.deployments(undefined, context);
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : "Vercel is unavailable",
      };
    }
  }

  async deploymentForCommit(commitSha: string, context: ProviderCallContext) {
    const deployments = await this.deployments(commitSha, context);
    const deployment = deployments[0];
    if (!deployment) return { id: commitSha, status: "unknown" as const };
    const state = deployment.readyState?.toUpperCase();
    const status =
      state === "READY"
        ? ("ready" as const)
        : state === "ERROR" || state === "CANCELED"
          ? ("failed" as const)
          : ("pending" as const);
    return {
      id: deployment.uid,
      ...(deployment.url ? { url: new URL(`https://${deployment.url}`) } : {}),
      status,
    };
  }

  private async deployments(
    commitSha: string | undefined,
    context: ProviderCallContext,
  ): Promise<Array<{ uid: string; url?: string; readyState?: string }>> {
    const url = new URL("https://api.vercel.com/v6/deployments");
    url.searchParams.set("projectId", this.options.projectId);
    url.searchParams.set("limit", "20");
    if (this.options.teamId) url.searchParams.set("teamId", this.options.teamId);
    if (commitSha) url.searchParams.set("meta-githubCommitSha", commitSha);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.options.token}` },
      signal: context.signal,
    });
    if (!response.ok)
      throw new ProviderError(
        response.status === 401 || response.status === 403
          ? "permission_denied"
          : "provider_unavailable",
        `Vercel request failed (${response.status})`,
        response.status >= 500,
      );
    return (
      (
        (await response.json()) as {
          deployments?: Array<{ uid: string; url?: string; readyState?: string }>;
        }
      ).deployments ?? []
    );
  }
}
