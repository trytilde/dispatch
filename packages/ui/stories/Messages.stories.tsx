import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { useChatExample } from "./chat-preview.js";
import {
  CitationLink,
  CodeBlock,
  DiffBlock,
  FileCard,
  ConversationMessage,
  InlinePath,
  MarkdownText,
  ChatMessage,
} from "@tryopenbot/ui";

const meta = {
  title: "Chat/Messages",
  parameters: { layout: "fullscreen", chatPlacement: "message" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const image =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='720' height='420'%3E%3Crect width='100%25' height='100%25' fill='%23dfe7df'/%3E%3Ccircle cx='360' cy='190' r='96' fill='%2371a77b'/%3E%3Ctext x='360' y='340' text-anchor='middle' font-family='sans-serif' font-size='28' fill='%23242a24'%3EDispatch workspace%3C/text%3E%3C/svg%3E";

export const Markdown: Story = {
  render: () => (
    <div style={{ width: "min(620px, 100%)" }}>
      <MarkdownText
        text={"Here is a **concise answer** with `inline code`.\n\n```ts\nconst ready = true;\n```"}
      />
    </div>
  ),
};

export const MarkdownDocument: Story = {
  render: () => (
    <div style={{ maxWidth: 650 }}>
      <MarkdownText
        text={`# Build an agent\n\nA concise paragraph with **strong text**, ~~old text~~, [a link](https://example.com), and a citation [[1]](https://example.com/source).\n\n> Keep the agent focused and let tools do the work.\n\n- [x] Configure the workspace\n- [ ] Deploy the agent\n\n| Surface | State |\n| --- | --- |\n| Chat | Ready |\n| Computer | Connected |\n\nUse \`configuration/agent/index.ts\` as the entrypoint.\n\n\`\`\`ts\nexport const agent = { name: "Dispatch" };\n\`\`\``}
      />
    </div>
  ),
};

export const Code: Story = {
  render: () => (
    <div style={{ maxWidth: 650 }}>
      <CodeBlock
        language="typescript"
        showLineNumbers
      >{`const agent = await createAgent({\n  name: "Dispatch",\n});`}</CodeBlock>
    </div>
  ),
};

export const Diff: Story = {
  render: () => (
    <div style={{ maxWidth: 650 }}>
      <DiffBlock
        value={` export const mode = "preview";\n-export const enabled = false;\n+export const enabled = true;`}
      />
    </div>
  ),
};

export const InlineContent: Story = {
  render: () => (
    <p style={{ fontSize: 13 }}>
      Edit <InlinePath value="configuration/agent/index.ts" /> and verify{" "}
      <CitationLink href="https://example.com/source">1</CitationLink>.
    </p>
  ),
};

function AttachmentMessageExample() {
  const inChat = useChatExample();
  const message = (role: "assistant" | "user") => (
    <ChatMessage
      role={role}
      createdAt="2026-09-07T10:00:00Z"
      message={{
        type: "ui",
        session_id: "session",
        parts: [
          {
            type: "text",
            text:
              role === "assistant"
                ? "I’ve reviewed the changes. Here are the files."
                : "Please review these files.",
          },
          { type: "file", filename: "workspace.svg", mediaType: "image/svg+xml", url: image },
          {
            type: "file",
            filename: "notes.txt",
            mediaType: "text/plain",
            url: "https://example.test/notes.txt",
          },
        ],
      }}
      resolveAttachmentUrl={async () => image}
    />
  );
  return inChat ? (
    message("assistant")
  ) : (
    <div style={{ display: "grid", gap: 20 }}>
      {message("assistant")}
      {message("user")}
    </div>
  );
}
export const FileAttachment: Story = {
  parameters: { chatPlacement: "conversation", chatReplaceAssistant: true },
  render: () => <AttachmentMessageExample />,
};

function usePreviewUrl(content: string, type: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const value = URL.createObjectURL(new Blob([content], { type }));
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [content, type]);
  return url;
}
function DocumentViewerExample() {
  const url = usePreviewUrl(
    "Dispatch notes\n\nReview the changes, confirm the release, and share the results.",
    "text/plain",
  );
  if (!url) return null;
  return (
    <ChatMessage
      role="assistant"
      createdAt="2026-09-07T10:00:00Z"
      message={{
        type: "ui",
        session_id: "session",
        parts: [
          { type: "text", text: "Here are my notes from the review." },
          { type: "file", filename: "notes.txt", mediaType: "text/plain", url },
        ],
      }}
      resolveAttachmentUrl={async () => url}
    />
  );
}
export const DocumentViewer: Story = {
  parameters: { chatPlacement: "conversation", chatReplaceAssistant: true },
  render: () => <DocumentViewerExample />,
};

function MediaViewerExample() {
  const first = usePreviewUrl(decodeURIComponent(image.split(",")[1]!), "image/svg+xml");
  const second = usePreviewUrl(
    decodeURIComponent(image.split(",")[1]!)
      .replace("Dispatch workspace", "Review result")
      .replace("#71a77b", "#8a79bb"),
    "image/svg+xml",
  );
  if (!first || !second) return null;
  const items = [
    { id: "one", mediaType: "image/svg+xml", title: "workspace.svg", url: first },
    { id: "two", mediaType: "image/svg+xml", title: "result.svg", url: second },
  ];
  return (
    <ChatMessage
      role="assistant"
      createdAt="2026-09-07T10:00:00Z"
      message={{
        type: "ui",
        session_id: "session",
        parts: [
          { type: "text", text: "Here are the workspace and review images." },
          ...items.map((item) => ({
            type: "file",
            filename: item.title,
            mediaType: item.mediaType,
            url: item.url,
          })),
        ],
      }}
      resolveAttachmentUrl={async () => ""}
    />
  );
}
export const MediaGallery: Story = {
  render: () => <MediaViewerExample />,
  parameters: { layout: "fullscreen", chatPlacement: "conversation", chatReplaceAssistant: true },
};
