import type { Meta, StoryObj } from "@storybook/react-vite";
import { ParticipantAvatar, ParticipantAvatarStack, SessionIcon } from "@tryopenbot/ui";
import { owner, assistant, alex, researcher } from "./session-fixtures.js";
const meta = { title: "Primitives/Avatars" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Avatars: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24 }}>
      <ParticipantAvatar participant={assistant} />
      <ParticipantAvatar participant={alex} />
    </div>
  ),
};
export const Stack: Story = {
  render: () => <ParticipantAvatarStack participants={[assistant, alex, researcher]} />,
};
export const SessionIcons: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        Single agent
        <SessionIcon participants={[owner, assistant]} currentUserId="me" />
      </div>
      <div>
        Single person
        <SessionIcon participants={[owner, alex]} currentUserId="me" />
      </div>
      <div>
        People and agents
        <SessionIcon participants={[owner, assistant, alex, researcher]} currentUserId="me" />
      </div>
    </div>
  ),
};
