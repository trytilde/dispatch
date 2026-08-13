import type { ToolSet } from "ai";
import { describe, expect, it } from "vite-plus/test";
import { asRegisteredTool, providerSignal, registeredToolsToToolSet } from "./core.js";

describe("tools provider core", () => {
  it("turns a named AI SDK tool array into a ToolSet", () => {
    const tool = { description: "Search connected tools" } as ToolSet[string];
    const registered = asRegisteredTool("SEARCH_TOOLS", tool);

    expect(registered).toBe(tool);
    expect(registeredToolsToToolSet([registered])).toEqual({ SEARCH_TOOLS: registered });
  });

  it("rejects elapsed deadlines before provider I/O", () => {
    expect(() => providerSignal({ requestId: "test", deadline: new Date(0) })).toThrowError(
      expect.objectContaining({ code: "deadline_exceeded" }),
    );
    const controller = new AbortController();
    controller.abort();
    expect(() => providerSignal({ requestId: "test", signal: controller.signal })).toThrowError(
      expect.objectContaining({ code: "deadline_exceeded" }),
    );
  });
});
