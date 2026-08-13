import { describe, expect, it } from "vitest";
import { AgentProviderError, pageSize, providerSignal } from "./core.js";

describe("agent provider core", () => {
  it("clamps provider page sizes", () => {
    expect(pageSize(undefined, 20)).toBe(20);
    expect(pageSize(500, 20)).toBe(100);
    expect(() => pageSize(0, 20)).toThrow(AgentProviderError);
  });

  it("rejects elapsed deadlines before provider I/O", () => {
    expect(() => providerSignal({ requestId: "test", deadline: new Date(0) })).toThrowError(
      expect.objectContaining({ code: "deadline_exceeded" }),
    );
  });
});
