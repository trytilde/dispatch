import { describe, expect, it } from "vite-plus/test";
import { parseSseFrame } from "./sse.js";

describe("SSE parser", () => {
  it("preserves event ids and JSON data", () => {
    expect(
      parseSseFrame('id: event-one\nevent: message_streaming\ndata: {"text":"hello"}'),
    ).toEqual({ id: "event-one", type: "message_streaming", data: { text: "hello" } });
  });

  it("accepts plain-text event data", () => {
    expect(parseSseFrame("data: still working")).toEqual({
      type: "message",
      data: "still working",
    });
  });
});
