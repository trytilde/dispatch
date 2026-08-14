import { describe, expect, it } from "vite-plus/test";
import { ChatProviderError, pageSize, providerSignal } from "./core.js";

describe("chat provider core", () => {
  it("normalizes pagination", () => {
    expect(pageSize(undefined, 20)).toBe(20);
    expect(pageSize(500, 20)).toBe(100);
    expect(() => pageSize(0, 20)).toThrow(ChatProviderError);
  });

  it("rejects elapsed deadlines", () => {
    expect(() => providerSignal({ requestId: "test", deadline: new Date(0) })).toThrowError(
      expect.objectContaining({ code: "deadline_exceeded" }),
    );
  });
});
