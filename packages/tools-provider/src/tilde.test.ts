import { createClient } from "@trytilde/harness-sdk";
import { describe, expect, it, vi } from "vite-plus/test";
import { TildeToolProvider } from "./tilde.js";

describe("TildeToolProvider", () => {
  it("depends on shared Tilde setup", () => {
    const client = createClient({ teamId: "team-one", apiKey: "secret" });
    const provider = new TildeToolProvider({ client });
    expect(provider.platforms.map(({ id }) => id)).toEqual(["tilde"]);
    expect(provider.initialization.questions).toEqual([]);
  });

  it("creates a missing agent MCP server", async () => {
    const client = createClient({ teamId: "team-one", apiKey: "secret" });
    vi.spyOn(client.mcp, "getServer").mockRejectedValue({ status: 404 });
    vi.spyOn(client.mcp, "createServer").mockResolvedValue({
      id: "openbot-scout",
      name: "OpenBot scout",
      teamId: "team-one",
      isDynamicToolDiscovery: true,
      tools: [],
      url: "https://tilde.test/mcp",
    });
    const provider = new TildeToolProvider({ client });
    await expect(
      provider.ensureServer(
        { id: "openbot-scout", name: "OpenBot scout", dynamicToolDiscovery: true },
        { requestId: "request-one" },
      ),
    ).resolves.toEqual({ id: "openbot-scout" });
    expect("listTools" in provider).toBe(false);
    expect("invoke" in provider).toBe(false);
  });
});
