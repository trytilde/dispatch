import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  ConnectionCard,
  FileCard,
  FileViewer,
  JsonBlock,
  MarkdownText,
  MediaViewer,
  MessageContent,
  ReasoningCard,
  ToolCallCard,
} from "../src/index.js";

const meta = { title: "OpenBot/Messages" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => undefined;
const image =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='720' height='420'%3E%3Crect width='100%25' height='100%25' fill='%23dfe7df'/%3E%3Ccircle cx='360' cy='190' r='96' fill='%2371a77b'/%3E%3Ctext x='360' y='340' text-anchor='middle' font-family='sans-serif' font-size='28' fill='%23242a24'%3EOpenBot workspace%3C/text%3E%3C/svg%3E";

export const Markdown: Story = {
  render: () => (
    <div style={{ width: 620 }}>
      <MarkdownText
        text={"Here is a **concise answer** with `inline code`.\n\n```ts\nconst ready = true;\n```"}
      />
    </div>
  ),
};

export const JSON: Story = {
  render: () => (
    <div style={{ width: 520 }}>
      <JsonBlock label="Tool output" value={{ status: "ready", count: 3 }} />
    </div>
  ),
};
export const Reasoning: Story = {
  render: () => (
    <div style={{ width: 620 }}>
      <ReasoningCard
        state="streaming"
        text="First inspect the workspace, then compare the available options."
      />
    </div>
  ),
};
export const ToolCall: Story = {
  render: () => (
    <div style={{ width: 620 }}>
      <ToolCallCard
        part={{
          type: "tool-shell",
          toolName: "Run command",
          state: "input-available",
          input: { command: "pnpm check" },
          output: "Passed",
        }}
      />
    </div>
  ),
};

export const ConnectionNeedsAuthorization: Story = {
  render: () => (
    <div style={{ width: 520 }}>
      <ConnectionCard
        connection={{
          authorizationUrl: "https://example.com/authorize",
          description: "Connect your workspace to continue",
          id: "calendar",
          name: "Calendar",
          status: "Needs authorization",
        }}
      />
    </div>
  ),
};

export const ConnectionAdded: Story = {
  render: () => (
    <div style={{ width: 520 }}>
      <ConnectionCard
        connection={{
          description: "Ready to use",
          id: "files",
          name: "Files",
          status: "Connected",
        }}
      />
    </div>
  ),
};

export const FileAttachment: Story = {
  render: () => (
    <div style={{ width: 520 }}>
      <FileCard
        part={{
          filename: "workspace.png",
          mediaType: "image/png",
          type: "file",
          url: "https://placehold.co/800x480/png",
        }}
        resolveAttachmentUrl={async () => "https://placehold.co/800x480/png"}
        rewriteUrl={(url) => url}
        sessionId="session"
      />
    </div>
  ),
};

export const DocumentViewer: Story = {
  render: () => (
    <FileViewer
      mediaType="text/plain"
      onClose={noop}
      open
      subtitle="Text document"
      title="notes.txt"
      url="data:text/plain,OpenBot%20notes"
    />
  ),
  parameters: { layout: "fullscreen" },
};

function MediaViewerExample() {
  const [index, setIndex] = useState(0);
  return (
    <MediaViewer
      activeIndex={index}
      items={[
        { id: "one", mediaType: "image/svg+xml", title: "Workspace", url: image },
        {
          id: "two",
          mediaType: "image/svg+xml",
          title: "Result",
          url: image,
          caption: "A second media item",
        },
      ]}
      onClose={noop}
      onSelect={setIndex}
      open
    />
  );
}

export const MediaGallery: Story = {
  render: () => <MediaViewerExample />,
  parameters: { layout: "fullscreen" },
};

export const ComposedMessageContent: Story = {
  render: () => (
    <div style={{ width: 620 }}>
      <MessageContent
        message={{
          parts: [
            { type: "text", text: "I completed the request." },
            { type: "reasoning", state: "done", text: "The task passed its checks." },
            { data: { status: "ready" }, type: "data" },
          ],
          session_id: "session",
          type: "ui",
        }}
        resolveAttachmentUrl={async () => image}
      />
    </div>
  ),
};
