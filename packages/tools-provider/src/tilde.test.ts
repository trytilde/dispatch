import { createClient } from "@trytilde/harness-sdk";
import type { ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";
import { TildeToolProvider } from "./tilde.js";

const mocks = vi.hoisted(() => {
  const tools: ToolSet = {
    SEARCH_TOOLS: { description: "Search connected tools" } as ToolSet[string],
    MULTI_EXECUTE_TOOL: { description: "Execute selected tools" } as ToolSet[string],
  };
  const mcp = {
    tools: vi.fn(async () => tools),
    callTool: vi.fn(async (name: string, input?: Record<string, unknown>) => ({ name, input })),
  };
  return { mcp, closeMcp: vi.fn(async () => undefined), createMCPClient: vi.fn(async () => ({ mcp, closeMcp: mocks.closeMcp })) };
});

vi.mock("@trytilde/harness-sdk-vercel-ai-node", () => ({
  createMCPClient: mocks.createMCPClient,
}));

describe("TildeToolProvider", () => {
  it("uses the Harness SDK MCP client and registers named AI SDK tools", async () => {
    const client = createClient({ baseUrl: "https://tilde.test", teamId: "team-one", apiKey: "secret" });
    vi.spyOn(client.mcp, "getServer").mockResolvedValue({
      id: "runtime-one",
      name: "OpenBot runtime",
      teamId: "team-one",
      isDynamicToolDiscovery: true,
      tools: [],
      url: "https://tilde.test/mcp",
    });

    const provider = new TildeToolProvider({ client, serverId: "runtime-one" });
    const registered = await provider.registerTools({ requestId: "request-one" });

    expect(mocks.createMCPClient).toHaveBeenCalledWith({ client, serverId: "runtime-one" });
    expect(registered.map((tool) => tool.name)).toEqual(["SEARCH_TOOLS", "MULTI_EXECUTE_TOOL"]);
    await expect(provider.injectPromptPart({ agentId: "agent", sessionId: "session" }, { requestId: "request-one" })).resolves.toContain("GET_TOOL_SCHEMAS");
  });

  it("invokes through and closes the Harness SDK MCP client", async () => {
    const client = createClient({ baseUrl: "https://tilde.test", teamId: "team-one", apiKey: "secret" });
    vi.spyOn(client.mcp, "getServer").mockResolvedValue({
      id: "runtime-one",
      name: "OpenBot runtime",
      teamId: "team-one",
      isDynamicToolDiscovery: false,
      tools: [],
      url: "https://tilde.test/mcp",
    });
    const provider = new TildeToolProvider({ client, serverId: "runtime-one" });

    await expect(provider.invoke("SEARCH_TOOLS", { query: "email" }, { requestId: "request-one" })).resolves.toEqual({
      name: "SEARCH_TOOLS",
      input: { query: "email" },
    });
    await provider.close();
    expect(mocks.closeMcp).toHaveBeenCalled();
  });
});
