import { describe, expect, it } from "vite-plus/test";
import { providerSignal } from "./core.js";

describe("tools provider core", () => {
  it("rejects elapsed or aborted calls before provider I/O", () => {
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
