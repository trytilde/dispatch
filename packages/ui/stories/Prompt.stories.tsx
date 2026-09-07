import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryPrompt, useChatExample } from "./chat-preview.js";
import { queueExample } from "./Queue.stories.js";

const meta = {
  title: "Chat/Controls/Prompt",
  parameters: { layout: "fullscreen", chatPlacement: "prompt" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <StoryPrompt /> };
export const Draft: Story = {
  render: () => <StoryPrompt initialDraft="Draft a concise launch plan" />,
};
export const Expanded: Story = {
  render: () => (
    <StoryPrompt
      expanded
      initialDraft={"Review the changes.\nSummarize the important decisions."}
    />
  ),
};
export const Markdown: Story = {
  render: () => (
    <StoryPrompt
      expanded
      initialDraft={
        "**Launch plan**\n\n- Review the *important* changes\n- Confirm the release date\n\n1. Test the workflow\n2. Share the results"
      }
    />
  ),
};
export const LongDraft: Story = {
  render: () => (
    <StoryPrompt
      expanded
      initialDraft={Array.from(
        { length: 35 },
        (_, index) => `Paragraph ${index + 1}: review the implementation and capture the findings.`,
      ).join("\n\n")}
    />
  ),
};
export const Busy: Story = { render: () => <StoryPrompt busy initialDraft="Do this next" /> };
export const Reply: Story = {
  render: () => (
    <StoryPrompt
      queue={queueExample}
      showScrollToBottom
      status={{ kind: "action-needed", message: "Review needed" }}
      reply={{ label: "Assistant", text: "Which option would you like to try?" }}
    />
  ),
};
function AttachmentExample() {
  const inChat = useChatExample();
  const image = {
    id: "image",
    name: "Design reference with a deliberately long filename.png",
    size: 4096,
    progress: 0,
    status: "ready" as const,
    previewUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23b5c9bc'/%3E%3Ccircle cx='40' cy='40' r='22' fill='%2370937b'/%3E%3C/svg%3E",
  };
  return (
    <StoryPrompt
      attachments={
        inChat
          ? [image]
          : [
              image,
              {
                id: "notes",
                name: "Meeting notes for the next release.txt",
                size: 2048,
                progress: 0,
                status: "ready",
              },
            ]
      }
    />
  );
}
export const Attachment: Story = { render: () => <AttachmentExample /> };
export const Error: Story = {
  render: () => (
    <StoryPrompt
      status={{ kind: "failed", message: "Connection interrupted. Your draft is safe." }}
      initialDraft="Please try again"
    />
  ),
};
