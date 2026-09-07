import { describe, expect, it } from "vite-plus/test";
import { splitMessageSegments, toolAttachmentFilePart } from "./message-blocks.js";

describe("message block segmentation", () => {
  it("does not relabel communication as reasoning just because a tool follows", () => {
    const tool = {
      type: "tool",
      tool_name: "SEARCH_TOOLS",
      state: "output-available",
      output: { isError: false },
    };
    expect(
      splitMessageSegments([
        { type: "text", text: "I will inspect the registry." },
        tool,
        { type: "text", text: "Here is the result." },
      ]),
    ).toEqual([
      { kind: "text", text: "I will inspect the registry." },
      { kind: "run", parts: [tool] },
      { kind: "text", text: "Here is the result." },
    ]);
  });
  it("keeps attachment-shaped tool output as an event, separate from a sent attachment", () => {
    const tool = {
      type: "tool",
      tool_name: "image",
      output: {
        attachment_id: "attachment-one",
        media_type: "image/png",
        filename: "screenshot.png",
      },
    };
    const file = {
      type: "file",
      attachment_id: "attachment-one",
      media_type: "image/png",
      filename: "screenshot.png",
    };
    expect(splitMessageSegments([tool, file])).toEqual([
      { kind: "run", parts: [tool] },
      { kind: "files", parts: [file] },
    ]);
    expect(toolAttachmentFilePart(tool)).toEqual(file);
  });
  it("can render inline tool screenshots as media inside an event", () => {
    expect(
      toolAttachmentFilePart({
        type: "tool-screenshot",
        tool_name: "screenshot",
        output: { media_type: "image/png", data: "aGVsbG8=", filename: "screenshot.png" },
      }),
    ).toEqual({
      type: "file",
      media_type: "image/png",
      filename: "screenshot.png",
      url: "data:image/png;base64,aGVsbG8=",
    });
  });
});
