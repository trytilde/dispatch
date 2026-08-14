import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TildeSkillProvider } from "./tilde.js";

const config = {
  apiKey: "secret",
  orgId: "org-one",
  teamId: "team-one",
  baseUrl: "https://tilde.test",
};
const context = { requestId: "request-one" };
const timestamp = "2026-08-12T00:00:00.000Z";
const registry = {
  id: "registry-one",
  name: "OpenBot",
  description: "OpenBot skills",
  org_id: "org-one",
  team_id: "team-one",
  skills: [],
  created_at: timestamp,
  updated_at: timestamp,
};

afterEach(() => vi.unstubAllGlobals());

describe("TildeSkillProvider", () => {
  it("depends on shared Tilde setup", () => {
    expect(new TildeSkillProvider(config).platforms.map(({ id }) => id)).toEqual(["tilde"]);
  });

  it("lists and provisions registries through the typed API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const request = input instanceof Request ? input : new Request(input);
        return request.method === "GET"
          ? Response.json({ items: [registry], next_page_token: null })
          : Response.json(registry);
      }),
    );
    const provider = new TildeSkillProvider(config);
    await expect(
      provider.listRegistries({ namePrefix: "OpenBot" }, context),
    ).resolves.toMatchObject([{ id: "registry-one" }]);
    await expect(
      provider.registerSkills(
        { name: "OpenBot", description: "OpenBot skills", skillIds: [] },
        context,
      ),
    ).resolves.toMatchObject({ id: "registry-one" });
    expect("listSkills" in provider).toBe(false);
    expect("materializeSkillAssets" in provider).toBe(false);
  });
});
