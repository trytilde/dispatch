import { afterEach, describe, expect, it, vi } from "vitest";
import { TildeSkillProvider } from "./tilde.js";

const config = {
  apiKey: "secret",
  orgId: "org-one",
  teamId: "team-one",
  registryId: "registry-one",
  baseUrl: "https://tilde.test",
};
const context = { requestId: "request-one" };
const timestamp = "2026-08-12T00:00:00.000Z";

function skill(id = "skill-one") {
  return {
    id,
    name: "Research",
    description: "Research carefully",
    content: "# Research",
    version: 1,
    source_kind: "repository",
    source_path: "configuration/agents/research/skills/research",
    source_repository_url: null,
    source_commit_hash: null,
    source_provider_id: null,
    org_id: "org-one",
    team_id: "team-one",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function registry() {
  return {
    id: "registry-one",
    name: "OpenBot",
    description: "OpenBot skills",
    org_id: "org-one",
    team_id: "team-one",
    skills: [skill()],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("TildeSkillProvider", () => {
  it("uses the typed SDK for skill and registry control operations", async () => {
    const requests: Request[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname.endsWith("/skill-registry")) return Response.json(registry());
      if (request.method === "POST" && url.pathname.endsWith("/skill")) return Response.json(skill());
      if (url.pathname.endsWith("/skill")) return Response.json({ items: [skill()], next_page_token: "next" });
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }));

    const provider = new TildeSkillProvider(config);
    const listed = await provider.listSkills({ pageSize: 10 }, context);
    const created = await provider.createSkill({ name: "Research", description: "Research carefully", content: "# Research" }, context);
    const registered = await provider.registerSkills({ name: "OpenBot", description: "OpenBot skills", skillIds: [created.id] }, context);

    expect(listed).toMatchObject({ items: [{ id: "skill-one", sourceKind: "repository" }], nextPageToken: "next" });
    expect(registered).toMatchObject({ id: "registry-one", skills: [{ id: "skill-one" }] });
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "POST"]);
    expect(requests.every((request) => request.headers.get("x-api-key") === "secret")).toBe(true);
  });

  it("verifies package assets before writing them to a destination", async () => {
    const content = new TextEncoder().encode("asset content");
    const digest = await crypto.subtle.digest("SHA-256", content);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      if (url.hostname === "assets.test") return new Response(content);
      if (url.pathname.endsWith("/package/download")) {
        return Response.json({ path: "scripts/run.sh", url: "https://assets.test/run.sh", expires_at: timestamp });
      }
      if (url.pathname.endsWith("/package")) {
        return Response.json({
          id: "skill-one",
          provider_id: "provider-one",
          source_path: "skills/research",
          source_commit_hash: "abc123",
          content_hash: checksum,
          created_at: timestamp,
          files: [{ path: "scripts/run.sh", size_bytes: content.byteLength, checksum_sha256: checksum, media_type: "text/x-shellscript", executable: true }],
        });
      }
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }));
    const writes: Array<{ path: string; content: string; executable: boolean }> = [];

    const manifest = await new TildeSkillProvider(config).materializeSkillAssets("skill-one", {
      async writeFile(path, bytes, options) {
        writes.push({ path, content: new TextDecoder().decode(bytes), executable: options.executable });
      },
    }, context);

    expect(manifest.files).toHaveLength(1);
    expect(writes).toEqual([{ path: "scripts/run.sh", content: "asset content", executable: true }]);
  });

  it("exposes only discovery and read operations as model tools", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      if (url.pathname.endsWith("/search")) return Response.json({ items: [skill()] });
      return Response.json(registry());
    }));
    const provider = new TildeSkillProvider(config);
    const tools = provider.registerTools(context);

    expect(tools.map((entry) => entry.name)).toEqual(["search_skills", "read_skill"]);
    expect(provider.injectPromptPart({ agentId: "agent-one", sessionId: "session-one" }, context)).toContain("search_skills");
    expect(await tools[0]?.execute?.({ query: "research", limit: 5 }, { toolCallId: "call-one", messages: [] })).toMatchObject([{ id: "skill-one" }]);
  });
});
