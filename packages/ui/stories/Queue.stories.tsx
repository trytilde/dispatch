import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryPrompt } from "./chat-preview.js";
const meta = {
  title: "Chat/Controls/Queue",
  excludeStories: ["queueExample"],
  parameters: { layout: "fullscreen", chatPlacement: "prompt" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => undefined;
export const queueExample = {
  items: [
    { id: "one", text: "Summarize the latest findings" },
    {
      id: "two",
      text: "Draft the final response with an intentionally long instruction that stays clipped before the steer button, leaving every action reachable.",
    },
  ],
  onEdit: noop,
  onReorder: noop,
  onRemove: noop,
  onRunNow: noop,
};
export const Queue: Story = { render: () => <StoryPrompt queue={queueExample} /> };
