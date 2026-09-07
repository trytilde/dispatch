import type { Meta, StoryObj } from "@storybook/react-vite";
import { MessageContent } from "@tryopenbot/ui";
import { useChatExample } from "./chat-preview.js";
const meta = {
  title: "Chat/Events/Tools",
  parameters: { layout: "fullscreen", chatPlacement: "event" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const text = "Checked the project and confirmed that all validations passed";
function ToolCallExample() {
  const inChat = useChatExample();
  const detail = (
    <MessageContent
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          {
            type: "tool-shell",
            toolName: "Run command",
            summary: text,
            state: "output-available",
            input: { command: "pnpm check" },
            output: "All validations passed. Type checks and package tests completed successfully.",
          },
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  );
  const summary = (
    <MessageContent
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          {
            type: "data",
            data_type: "tilde-tool-summary",
            data: {
              toolName: "Run command",
              toolCallId: "one",
              summary: text,
              state: "output-available",
            },
          },
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  );
  return inChat ? (
    detail
  ) : (
    <div style={{ display: "grid", gap: 20 }}>
      <section>
        <h3 className="chat-story-label">Summary only</h3>
        {summary}
      </section>
      <section>
        <h3 className="chat-story-label">Full details available</h3>
        {detail}
      </section>
    </div>
  );
}
export const ToolCall: Story = { render: () => <ToolCallExample /> };
export const DispatchReasoning: Story = {
  render: () => (
    <MessageContent
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          {
            type: "reasoning",
            text: "Inspecting the project before making changes.",
            state: "streaming",
          },
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  ),
};

export const ChainedToolCalls: Story = {
  render: () => (
    <MessageContent
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          {
            type: "tool-shell",
            toolCallId: "freeze",
            summary: "Rebuild and verify",
            input: { command: "npm run freeze", cwd: "/workspace" },
            output: "Built in 1.2s\n34 checks passed",
            state: "output-available",
          },
          {
            type: "tool-read",
            toolCallId: "read",
            summary: "Read the result",
            input: { path: "result.json", limit: 20 },
            output: { status: "ready", checks: 34 },
            state: "output-available",
          },
          {
            type: "data",
            data_type: "tilde-tool-summary",
            data: {
              toolName: "Run command",
              toolCallId: "summary",
              state: "output-available",
              summary: "Confirmed that all validations passed.",
            },
          },
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  ),
};

export const LongToolOutput: Story = {
  render: () => (
    <MessageContent
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          {
            type: "tool-shell",
            summary: "Full execution result",
            input: { command: "npm run verify" },
            output: `${Array.from({ length: 80 }, (_, index) => `Result line ${index + 1}: all details remain available.`).join("\n")}\nEND OF TOOL OUTPUT`,
            state: "output-available",
          },
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  ),
};
export const LongReasoningOutput: Story = {
  render: () => (
    <MessageContent
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          {
            type: "reasoning",
            text: `${Array.from({ length: 60 }, (_, index) => `Reasoning paragraph ${index + 1}: inspect each condition and retain the complete explanation.`).join("\n\n")}\n\nEND OF REASONING`,
            state: "streaming",
          },
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  ),
};

export const MultiExecute: Story = {
  render: () => (
    <MessageContent
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          {
            type: "tool-MULTI_EXECUTE_TOOL",
            toolCallId: "batch-example",
            input: {
              invocations: [
                { tool_name: "search_messages", parameters: { query: "release" } },
                { tool_name: "read_document", parameters: { id: "notes" } },
              ],
            },
            output: {
              results: [
                { tool_name: "search_messages", success: true, output: { matches: 3 } },
                { tool_name: "read_document", success: false, error: "Document unavailable" },
              ],
            },
          },
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  ),
};
