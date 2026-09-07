import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ConversationMessage,
  UnknownMessageCard,
  ConversationSkeleton,
  ThinkingIndicator,
} from "@tryopenbot/ui";

const meta = {
  title: "Chat/Messages/Conversation",
  parameters: { layout: "fullscreen", chatPlacement: "conversation" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Agent: Story = {
  render: () => (
    <ConversationMessage role="agent" createdAt="2026-09-07T10:00:00Z">
      <p>I found the answer and organized the result.</p>
    </ConversationMessage>
  ),
};
export const User: Story = {
  render: () => (
    <ConversationMessage role="user" createdAt="2026-09-07T10:00:00Z">
      <p>Please turn this into a concise plan.</p>
    </ConversationMessage>
  ),
};
export const ContinuedMessages: Story = {
  render: () => (
    <>
      <ConversationMessage role="agent" continuedNext createdAt="2026-09-07T10:00:00Z">
        First, inspect the workspace.
      </ConversationMessage>
      <ConversationMessage role="agent" continuedPrevious createdAt="2026-09-07T10:00:10Z">
        Then compare the available options.
      </ConversationMessage>
    </>
  ),
};
export const UnknownMessage: Story = {
  parameters: { chatPlacement: "conversation" },
  render: () => <UnknownMessageCard productName="Dispatch" messageType="future-message" />,
};

export const LoadingConversation: Story = { render: () => <ConversationSkeleton /> };
export const Working: Story = {
  render: () => <ThinkingIndicator>Assistant is working…</ThinkingIndicator>,
};
