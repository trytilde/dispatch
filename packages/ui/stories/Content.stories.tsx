import { useChatExample } from "./chat-preview.js";
import { useEffect, useId, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AudioPlayer, ChatMessage, DiagramCard, LinkPreviewCard } from "@tryopenbot/ui";

const meta = {
  title: "Chat/Messages/Rich content",
  parameters: { layout: "fullscreen", chatPlacement: "message" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => undefined;
const image =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='420'%3E%3Crect width='100%25' height='100%25' fill='%23e7e9e7'/%3E%3Crect x='72' y='56' width='656' height='308' rx='16' fill='%23fbfbfa' stroke='%23d8dad8'/%3E%3Ccircle cx='400' cy='178' r='58' fill='%2371a77b'/%3E%3Ctext x='400' y='286' text-anchor='middle' font-family='sans-serif' font-size='26' fill='%23242624'%3EDispatch Computer%3C/text%3E%3C/svg%3E";
function InlineAudioExample() {
  const inChat = useChatExample();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const bytes = new Uint8Array(44 + 16000);
    const view = new DataView(bytes.buffer);
    const word = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
    };
    word(0, "RIFF");
    view.setUint32(4, bytes.length - 8, true);
    word(8, "WAVE");
    word(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    word(36, "data");
    view.setUint32(40, 16000, true);
    const value = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, []);
  if (!url) return null;
  return inChat ? (
    <ChatMessage
      role="assistant"
      createdAt="2026-09-07T10:03:00Z"
      message={{
        type: "ui",
        session_id: "example",
        parts: [
          { type: "text", text: "Here is the voice note." },
          { type: "file", filename: "Voice note.wav", mediaType: "audio/wav", url },
        ],
      }}
      resolveAttachmentUrl={async () => url}
    />
  ) : (
    <AudioPlayer name="Voice note.wav" src={url} />
  );
}
export const InlineAudio: Story = {
  parameters: { chatPlacement: "conversation", chatReplaceAssistant: true },
  render: () => <InlineAudioExample />,
};

const metadata = {
  description: "A concise guide to building and operating an agent workspace.",
  hostname: "docs.example.com",
  imageUrl: image,
  title: "Build an agent workspace",
};

export const LinkCard: Story = {
  parameters: {
    chatPlacement: "event",
    docs: {
      description: {
        story:
          "Reusable presentation only; Dispatch does not currently generate this card from chat history.",
      },
    },
  },
  render: () => <LinkPreviewCard metadata={metadata} url="https://docs.example.com/openbot" />,
};

function DiagramPreview() {
  const arrowId = useId();
  return (
    <svg aria-label="Agent workflow" height="220" role="img" viewBox="0 0 620 220" width="620">
      <defs>
        <marker id={arrowId} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
          <path d="M0 0L8 4L0 8Z" fill="currentColor" />
        </marker>
      </defs>
      <g fill="#fbfbfa" stroke="#aeb2ae" strokeWidth="1.2">
        <rect height="64" rx="12" width="150" x="22" y="78" />
        <rect height="64" rx="12" width="150" x="235" y="78" />
        <rect height="64" rx="12" width="150" x="448" y="78" />
      </g>
      <g fill="#242624" fontFamily="sans-serif" fontSize="14" textAnchor="middle">
        <text x="97" y="116">
          Request
        </text>
        <text x="310" y="116">
          Agent
        </text>
        <text x="523" y="116">
          Computer
        </text>
      </g>
      <g fill="none" markerEnd={`url(#${arrowId})`} stroke="#616661" strokeWidth="1.5">
        <path d="M172 110H225" />
        <path d="M385 110H438" />
      </g>
    </svg>
  );
}

export const Diagram: Story = {
  parameters: {
    chatPlacement: "event",
    docs: {
      description: {
        story:
          "Reusable presentation only; Dispatch does not currently generate this card from chat history.",
      },
    },
  },
  render: () => (
    <div style={{ width: "min(720px, 100%)" }}>
      <DiagramCard onCopy={noop} source="flowchart LR\nRequest --> Agent --> Computer">
        <DiagramPreview />
      </DiagramCard>
    </div>
  ),
};

export const DiagramLoading: Story = {
  parameters: {
    chatPlacement: "event",
    docs: {
      description: {
        story:
          "Reusable presentation only; Dispatch does not currently generate this card from chat history.",
      },
    },
  },
  render: () => (
    <div style={{ width: "min(720px, 100%)" }}>
      <DiagramCard source="flowchart LR" state="loading" />
    </div>
  ),
};

export const DiagramError: Story = {
  parameters: {
    chatPlacement: "event",
    docs: {
      description: {
        story:
          "Reusable presentation only; Dispatch does not currently generate this card from chat history.",
      },
    },
  },
  render: () => (
    <div style={{ width: "min(720px, 100%)" }}>
      <DiagramCard error="Unexpected diagram token" source="flowchart LR\nA --" state="error" />
    </div>
  ),
};
