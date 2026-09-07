import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AgentAvatar,
  AgentListItem,
  AgentSearchDialog,
  ChatHeader,
  ChatPane,
  ComputerIcon,
  ListIcon,
  MoreIcon,
  PlusIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  useWorkspaceLayout,
  WorkspaceAccount,
  WorkspaceShell,
  WorkspaceSidebar,
  ClockIcon,
} from "@tryopenbot/ui";

const meta = {
  title: "Dispatch/Workspace",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => undefined;
const agents = [
  { id: "hello-world", name: "Hello World", lastMessage: "Ready when you are.", unread: true },
  { id: "research", name: "Research", lastMessage: "I found three useful sources." },
  { id: "writer", name: "Writer", lastMessage: "The draft is ready to review." },
] as const;

export const AgentAvatars: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12 }}>
      {agents.map((agent) => (
        <AgentAvatar id={agent.id} key={agent.id} />
      ))}
    </div>
  ),
};

export const AgentListItemState: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <AgentListItem agent={agents[0]} onSelect={noop} selected />
      <AgentListItem agent={agents[1]} onSelect={noop} selected={false} />
    </div>
  ),
};

export const AgentSearch: Story = {
  render: () => (
    <AgentSearchDialog
      agents={agents}
      loading={false}
      onChange={noop}
      onClose={noop}
      onSelect={noop}
      open
      value=""
    />
  ),
  parameters: { layout: "fullscreen" },
};

export const Account: Story = {
  render: () => (
    <div
      className="rich-chat"
      style={{ background: "#f7f7f7", display: "flex", flexDirection: "column", width: 280 }}
    >
      <WorkspaceAccount />
    </div>
  ),
};

export const AccountMenu: Story = {
  render: () => (
    <div
      className="rich-chat"
      style={{
        background: "#f7f7f7",
        display: "flex",
        flexDirection: "column",
        height: 340,
        position: "relative",
        width: 280,
      }}
    >
      <WorkspaceAccount />
    </div>
  ),
};

export const Sidebar: Story = {
  render: () => (
    <div style={{ height: 640, position: "relative", width: 280 }}>
      <WorkspaceSidebar
        agents={agents}
        onResize={noop}
        onSearchChange={noop}
        onSearchClose={noop}
        onSearchOpen={noop}
        onSelectAgent={noop}
        searchOpen={false}
        searchValue=""
        selectedAgentId="hello-world"
      />
    </div>
  ),
};

function LayoutExample() {
  const layout = useWorkspaceLayout();
  return (
    <WorkspaceShell
      computerOpen={layout.workspaceOpen}
      sidebarCollapsed={layout.sidebarCollapsed}
      style={{ ...layout.style, height: 520, width: "min(1100px, 95vw)" }}
    >
      <WorkspaceSidebar
        agents={agents}
        onResize={layout.beginSidebarResize}
        onSearchChange={noop}
        onSearchClose={noop}
        onSearchOpen={noop}
        onSelectAgent={noop}
        searchOpen={false}
        searchValue=""
        selectedAgentId="hello-world"
      />
      <ChatPane>
        <ChatHeader
          agentId="hello-world"
          agentName="Hello World"
          computerOpen={layout.workspaceOpen}
          onToggleComputer={layout.toggleWorkspace}
        />
      </ChatPane>
    </WorkspaceShell>
  );
}

export const WorkspaceAndLayoutHook: Story = {
  render: () => <LayoutExample />,
  parameters: { layout: "fullscreen" },
};

const iconEntries = [
  ["SearchIcon", SearchIcon],
  ["PlusIcon", PlusIcon],
  ["SendIcon", SendIcon],
  ["ReplyIcon", ReplyIcon],
  ["MoreIcon", MoreIcon],
  ["ComputerIcon", ComputerIcon],
  ["ListIcon", ListIcon],
  ["ClockIcon", ClockIcon],
] as const;

export const Icons: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(4, 100px)" }}>
      {iconEntries.map(([name, Icon]) => (
        <div
          key={name}
          style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 6 }}
        >
          <Icon />
          <small>{name}</small>
        </div>
      ))}
    </div>
  ),
};
