import { describe, expect, it } from "vite-plus/test";
import { projectChatTranscript, projectMessageParts, toolSummaryFromPart } from "./transcript.js";

describe("messages versus execution events", () => {
  it("keeps text and attachments in messages, and tools/reasoning outside bubbles", () => {
    const blocks = projectMessageParts([
      { type: "text", text: "I will inspect the project." },
      { type: "file", filename: "notes.txt" },
      { type: "reasoning", text: "Inspecting" },
      { type: "tool-shell", output: "done" },
      { type: "text", text: "Here is the result." },
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(["message", "event", "message"]);
    expect(blocks[0]!.parts).toHaveLength(2);
  });
  it("treats connector selection and tool summaries as events", () => {
    expect(
      projectMessageParts([
        { type: "tool-configure_connector", output: { connector_selection: {} } },
        { type: "data", data_type: "tilde-tool-summary", data: {} },
      ]).map((item) => item.kind),
    ).toEqual(["event"]);
  });
  it("strips raw details from a summary-mode payload", () => {
    const summary = toolSummaryFromPart({
      type: "data",
      data_type: "tilde-tool-summary",
      data: {
        toolName: "Shell",
        toolCallId: "call",
        state: "output-available",
        summary: "Read four files",
        input: { secret: "hidden-input" },
        output: "hidden-output",
      },
    });
    expect(summary).toEqual({
      toolName: "Shell",
      toolCallId: "call",
      state: "output-available",
      summary: "Read four files",
    });
    expect(
      toolSummaryFromPart({
        type: "data-tilde-tool-summary",
        data: { output: "never display this" },
      }),
    ).toBeUndefined();
  });
  it("keeps participant events outside messages and attributes other humans correctly", () => {
    const items = projectChatTranscript(
      [
        {
          id: "m",
          type: "ui",
          session_id: "s",
          role: "user",
          from_inbox_instance_id: "other",
          created_at: "2026-09-07T10:00:00Z",
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      [
        {
          id: "e",
          type: "participant.joined",
          occurred_at: "2026-09-07T09:59:00Z",
          data: {
            session_id: "s",
            participant: {
              participant_handle: "other",
              participant_type: "human",
              membership_source: "invitation",
              inbox_id: "inbox",
              inbox_instance_id: "other",
              display_name: "Alex",
            },
          },
        },
      ],
      {
        viewerUserId: "me",
        participants: [{ id: "other", userId: "alex", kind: "human", name: "Alex" }],
      },
    );
    expect(items.map((item) => item.kind)).toEqual(["participant", "message"]);
    expect(items[1]).toMatchObject({ alignment: "other" });
  });
});

describe("transcript day layout", () => {
  it("inserts calendar boundaries and keeps consecutive messages on the same side together", async () => {
    const { layoutChatTranscript } = await import("./transcript.js");
    const rows = layoutChatTranscript(
      projectChatTranscript(
        [0, 1, 2, 3].map((index) => ({
          id: `${index}`,
          session_id: "chat",
          type: "ui",
          role: index === 2 ? "user" : "assistant",
          created_at: new Date(2026, 8, index === 3 ? 8 : 7, 10, index).toISOString(),
          parts: [{ type: "text", text: "Hello" }],
        })),
      ),
    );
    expect(rows.map((row) => row.kind)).toEqual([
      "day",
      "message",
      "message",
      "message",
      "day",
      "message",
    ]);
    expect(rows[1]).toMatchObject({ continuedPrevious: false, continuedNext: true });
    expect(rows[2]).toMatchObject({ continuedPrevious: true, continuedNext: false });
    expect(rows[3]).toMatchObject({ continuedPrevious: false });
    expect(rows[5]).toMatchObject({ continuedPrevious: false });
  });
});

describe("generic tool-call presentation", () => {
  it("uses the projected summary without carrying raw details or a tool-name label", async () => {
    const { toolCallPresentation } = await import("./transcript.js");
    expect(
      toolCallPresentation({
        type: "data",
        data_type: "tilde-tool-summary",
        input: "hidden",
        output: "hidden",
        data: {
          toolName: "Run command",
          toolCallId: "one",
          state: "output-available",
          summary: "Checked the project",
          input: "hidden",
        },
      }),
    ).toEqual({ text: "Checked the project", state: "output-available" });
  });
  it("keeps full output for expansion instead of putting it in the collapsed row", async () => {
    const { toolCallPresentation } = await import("./transcript.js");
    const output = "Full result. ".repeat(200);
    expect(
      toolCallPresentation({
        type: "tool-shell",
        toolName: "Run command",
        input: { command: "check" },
        output,
      }),
    ).toEqual({ text: "Tool completed", details: { input: { command: "check" }, output } });
  });
});

describe("inline tool arguments", () => {
  it("formats named parameters without losing typed values", async () => {
    const { formatToolArguments } = await import("./transcript.js");
    expect(
      formatToolArguments({
        command: "npm run freeze",
        limit: 20,
        enabled: false,
        paths: ["a", "b"],
      }),
    ).toBe('$command = "npm run freeze", $limit = 20, $enabled = false, $paths = ["a","b"]');
    expect(formatToolArguments(undefined)).toBe("");
    expect(formatToolArguments("npm run freeze")).toBe('$input = "npm run freeze"');
  });
});

describe("multi-execute presentation", () => {
  it("expands ordered inner calls including duplicate names, pending and failed outcomes", async () => {
    const { expandToolBatches } = await import("./transcript.js");
    const parts = expandToolBatches([
      {
        type: "tool-MULTI_EXECUTE_TOOL",
        toolCallId: "batch",
        input: {
          invocations: [
            { tool_name: "read_file", parameters: { path: "a" } },
            { tool_name: "read_file", parameters: { path: "b" } },
          ],
        },
        output: {
          results: [
            { tool_name: "read_file", success: true, output: "first" },
            { tool_name: "read_file", success: false, error: "Unavailable" },
          ],
        },
      },
    ]);
    expect(parts.map((part) => part.tool_name)).toEqual(["read_file", "read_file"]);
    expect(parts.map((part) => part.tool_invocation_id)).toEqual([
      "batch:batch:0",
      "batch:batch:1",
    ]);
    expect(parts[1]).toMatchObject({ state: "output-error", error_text: "Unavailable" });
  });
  it("never exposes raw internals from a redacted multi-execute summary", async () => {
    const { expandToolBatches } = await import("./transcript.js");
    expect(
      expandToolBatches([
        {
          type: "data-tilde-tool-summary",
          data: {
            toolName: "MULTI_EXECUTE_TOOL",
            toolCallId: "batch",
            summary: "Hidden batch",
            state: "done",
          },
          input: { invocations: [{ tool_name: "secret_tool" }] },
        },
      ]),
    ).toEqual([]);
  });
});
