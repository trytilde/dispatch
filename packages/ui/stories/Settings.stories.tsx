import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  AppearanceSettings,
  SettingsContent,
  SettingsShell,
  PluginsSettingsView,
  type PluginsSettingsViewProps,
  type SettingsSection,
  type ThemePreference,
} from "@tryopenbot/ui";

const meta = { title: "Dispatch/Settings", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function SettingsExample() {
  const [section, setSection] = useState<SettingsSection>("general");
  const [theme, setTheme] = useState<ThemePreference>("system");
  return (
    <SettingsShell
      section={section}
      onBack={() => setSection("general")}
      onNavigate={(to) => setSection(to.split("/").pop() as SettingsSection)}
    >
      <SettingsContent width={section === "general" ? "constrained" : "wide"}>
        {section === "general" ? (
          <AppearanceSettings theme={theme} onThemeChange={setTheme} />
        ) : (
          <PluginsSettingsView {...base} kind={section === "skills" ? "skills" : "tools"} />
        )}
      </SettingsContent>
    </SettingsShell>
  );
}
export const Shell: Story = { render: () => <SettingsExample /> };

const base: PluginsSettingsViewProps = {
  agents: [
    {
      id: "assistant",
      display_name: "Assistant",
      provider_id: "example",
      status: "active",
      sessions: { items: [] },
    },
  ],
  kind: "tools",
  loading: false,
  setup: null,
  createdAccountId: null,
  createdAccountPendingAgentId: null,
  catalog: {
    tools: [
      {
        provider: {
          type_id: "calendar",
          name: "Calendar",
          documentation: "Manage your calendar.",
          credential_sources: [{ type_id: "oauth", name: "Sign in", requires_brokering: true }],
        },
        accounts: [
          {
            id: "account",
            display_name: "Personal",
            status: "active",
            enabled_for_personal: true,
            personal_user_id: "example-user",
            assigned_agent_ids: [],
          },
          {
            id: "bot-account",
            display_name: "Assistant calendar",
            status: "active",
            enabled_for_personal: false,
            assigned_agent_ids: ["assistant"],
          },
        ],
      },
    ],
    skills: [],
  },
  onAddToolAccount: () => undefined,
  onDeleteToolAccounts: async () => undefined,
  onSetSkill: async () => undefined,
  onSetToolAccount: async () => undefined,
  onCloseSetup: () => undefined,
  onReopenAuthorization: () => undefined,
  onSubmitSetup: () => undefined,
  onCloseAssignment: () => undefined,
  onAssignAccount: () => undefined,
};
function CatalogState(props: Partial<PluginsSettingsViewProps>) {
  return (
    <SettingsContent width="wide">
      <PluginsSettingsView {...base} {...props} />
    </SettingsContent>
  );
}
export const Connections: Story = { render: () => <CatalogState /> };
export const Loading: Story = { render: () => <CatalogState loading /> };
export const Empty: Story = { render: () => <CatalogState catalog={{ tools: [], skills: [] }} /> };
export const Error: Story = { render: () => <CatalogState error="Could not load plugins" /> };
export const Setup: Story = {
  render: () => <CatalogState setup={{ providerId: "calendar", submitting: false }} />,
};
export const Submitting: Story = {
  render: () => <CatalogState setup={{ providerId: "calendar", submitting: true }} />,
};
export const Authorization: Story = {
  render: () => (
    <CatalogState
      setup={{
        providerId: "calendar",
        submitting: false,
        authorizationUrl: "https://example.test/authorize",
      }}
    />
  ),
};
export const SetupError: Story = {
  render: () => (
    <CatalogState
      setup={{
        providerId: "calendar",
        submitting: false,
        error: "Could not connect. Please try again.",
      }}
    />
  ),
};
export const Assignment: Story = { render: () => <CatalogState createdAccountId="account" /> };
export const Assigning: Story = {
  render: () => (
    <CatalogState createdAccountId="account" createdAccountPendingAgentId="assistant" />
  ),
};
