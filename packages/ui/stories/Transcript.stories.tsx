import type { ReactNode } from "react";
import { StoryPrompt, useChatExample } from "./chat-preview.js";
import { layoutChatTranscript, projectChatTranscript } from "@tryopenbot/client-runtime";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ChatMessage,
  ConversationMessage,
  FailedSendActions,
  QueuedSendNotice,
  SentWhileOfflineNotice,
  SystemEvent,
  SystemEventChip,
  SystemEventLabel,
  ConversationSkeleton,
  TranscriptTimeSeparator,
  UnreadDivider,
} from "@tryopenbot/ui";

const meta = {
  title: "Chat/Events/Transcript",
  parameters: { layout: "fullscreen", chatPlacement: "event" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => undefined;

export const Loading: Story = {
  parameters: { chatPlacement: "conversation", chatReplaceHistory: true },
  render: () => <ConversationSkeleton />,
};
export const LoadError: Story = {
  parameters: { chatPlacement: "prompt" },
  render: () => (
    <StoryPrompt
      status={{ kind: "failed", message: "Couldn’t load this conversation. Please try again." }}
    />
  ),
};
export const NewMessages: Story = {
  parameters: { chatPlacement: "prompt" },
  render: () => <StoryPrompt newMessageCount={3} showScrollToBottom />,
};
export const Unread: Story = { render: () => <UnreadDivider /> };
function SendNoticeExample({ notice }: { notice: ReactNode }) {
  const inChat = useChatExample();
  const message = (role: "user" | "assistant") => (
    <ConversationMessage role={role} createdAt="2026-09-07T10:03:00Z" notice={notice}>
      {role === "user"
        ? "Please review the latest changes."
        : "I’ll share the latest review with you."}
    </ConversationMessage>
  );
  return inChat ? (
    message("user")
  ) : (
    <div className="message-list">
      {message("assistant")}
      {message("user")}
    </div>
  );
}
export const QueuedSend: Story = {
  parameters: { chatPlacement: "conversation" },
  render: () => (
    <SendNoticeExample notice={<QueuedSendNotice cancellable onCancel={noop} transportDown />} />
  ),
};
export const SentOffline: Story = {
  parameters: { chatPlacement: "conversation" },
  render: () => (
    <SendNoticeExample notice={<SentWhileOfflineNotice composedAt="2026-08-15T12:00:00Z" />} />
  ),
};
export const FailedSend: Story = {
  parameters: { chatPlacement: "conversation" },
  render: () => (
    <SendNoticeExample notice={<FailedSendActions onDelete={noop} onResend={noop} />} />
  ),
};
function DayHistoryExample() {
  const now = new Date();
  const dates = [3, 1, 0, 0, 0].map((days, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    date.setHours(10 + index, 3, 0, 0);
    return date.toISOString();
  });
  const items = layoutChatTranscript(
    projectChatTranscript(
      dates.map((created_at, index) => ({
        id: `day-message-${index}`,
        created_at,
        session_id: "example",
        type: "ui",
        role: index === 4 ? "user" : "assistant",
        parts: [
          {
            type: "text",
            text: [
              "The earlier review is ready.",
              "Yesterday’s update is ready.",
              "Here is today’s update.",
              "One more detail from the same side.",
              "Thanks, I’ll review it.",
            ][index]!,
          },
        ],
      })),
    ),
  );
  return (
    <div className="message-list">
      {items.map((item) =>
        item.kind === "day" ? (
          <TranscriptTimeSeparator key={item.id} dateTime={item.date} now={now} />
        ) : item.kind === "message" ? (
          <ChatMessage
            key={item.id}
            message={item.message}
            role={item.alignment === "self" ? "user" : "assistant"}
            createdAt={item.message.created_at}
            continuedPrevious={item.continuedPrevious}
            continuedNext={item.continuedNext}
            resolveAttachmentUrl={async () => ""}
          />
        ) : null,
      )}
    </div>
  );
}
export const TimeSeparator: Story = {
  parameters: { chatPlacement: "conversation", chatReplaceHistory: true },
  render: () => <DayHistoryExample />,
};

export const SystemEventRow: Story = {
  render: () => (
    <SystemEvent>
      <SystemEventLabel>Computer connected</SystemEventLabel>
      <SystemEventChip leading="⌁" onClick={noop}>
        View activity
      </SystemEventChip>
    </SystemEvent>
  ),
};
