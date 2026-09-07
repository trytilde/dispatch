import type { Meta, StoryObj } from "@storybook/react-vite";
import { PromptStatusBadge, ScrollToLatestButton } from "@tryopenbot/ui";
import { StoryPrompt, useChatExample } from "./chat-preview.js";
import { queueExample } from "./Queue.stories.js";
const meta = {
  title: "Chat/Controls",
  parameters: { layout: "fullscreen", chatPlacement: "prompt" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function StatusExample() {
  return useChatExample() ? (
    <StoryPrompt status={{ kind: "failed", message: "Couldn't send. Try again." }} />
  ) : (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <PromptStatusBadge status={{ kind: "unreachable" }} />
      <PromptStatusBadge status={{ kind: "failed" }} />
      <PromptStatusBadge status={{ kind: "action-needed" }} />
    </div>
  );
}
export const Statuses: Story = { render: () => <StatusExample /> };
function ScrollExample() {
  return useChatExample() ? (
    <StoryPrompt showScrollToBottom queue={queueExample} />
  ) : (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <ScrollToLatestButton onClick={() => undefined} />
    </div>
  );
}
export const ScrollToBottom: Story = { render: () => <ScrollExample /> };
