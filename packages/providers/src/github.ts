import type { ProviderCallContext, PullRequestPublication, SourceControlProvider } from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";

export interface GitHubSourceControlOptions {
  repository: string;
  token: string;
}

export class GitHubSourceControlProvider implements SourceControlProvider {
  readonly descriptor = {
    id: "github",
    version: "1.0.0",
    displayName: "GitHub",
    kind: "source-control" as const,
    capabilities: ["branches", "commits", "pull-requests"] as const,
  };

  constructor(private readonly options: GitHubSourceControlOptions) {}

  async health(context: ProviderCallContext) {
    const response = await this.request("", { signal: context.signal });
    return response.ok ? { healthy: true } : { healthy: false, message: `GitHub returned ${response.status}` };
  }

  async publishPullRequest(input: { branch: string; title: string; body: string; baseBranch: string; files: readonly { path: string; content: string }[] }, context: ProviderCallContext): Promise<PullRequestPublication> {
    const base = await this.json<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(input.baseBranch)}`, { signal: context.signal });
    await this.json("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: base.object.sha }), signal: context.signal });
    for (const file of input.files) {
      await this.json(`/contents/${file.path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        body: JSON.stringify({ message: input.title, branch: input.branch, content: Buffer.from(file.content).toString("base64") }),
        signal: context.signal,
      });
    }
    const pull = await this.json<{ number: number; html_url: string; state: string; merged: boolean }>("/pulls", {
      method: "POST",
      body: JSON.stringify({ title: input.title, body: input.body, head: input.branch, base: input.baseBranch }),
      signal: context.signal,
    });
    return this.pull(pull, input.branch);
  }

  async inspectPullRequest(id: string, context: ProviderCallContext): Promise<PullRequestPublication> {
    const pull = await this.json<{ number: number; html_url: string; state: string; merged: boolean; head: { ref: string } }>(`/pulls/${encodeURIComponent(id)}`, { signal: context.signal });
    return this.pull(pull, pull.head.ref);
  }

  private pull(pull: { number: number; html_url: string; state: string; merged: boolean }, branch: string): PullRequestPublication {
    return { id: String(pull.number), branch, url: new URL(pull.html_url), status: pull.merged ? "merged" : pull.state === "open" ? "open" : "closed" };
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return fetch(`https://api.github.com/repos/${this.options.repository}${path}`, {
      ...init,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.options.token}`, "X-GitHub-Api-Version": "2022-11-28", ...init.headers },
    });
  }

  private async json<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await this.request(path, init);
    if (!response.ok) throw new ProviderError(response.status === 404 ? "not_found" : "provider_unavailable", `GitHub request failed (${response.status})`, response.status >= 500);
    return await response.json() as T;
  }
}
