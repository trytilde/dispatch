import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  Button,
  PluginProviderCard,
  PluginItemRow,
  PluginCategorySection,
  PluginSearchField,
  PluginCategoryFilter,
  PluginAgentFilter,
  ResourceScopeFilter,
  PluginCatalogSkeleton,
} from "@tryopenbot/ui";
const meta = {
  title: "Dispatch/Settings/Tools",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const providers = [
  { id: "calendar", name: "Calendar", description: "Manage calendars and schedule events." },
  { id: "github", name: "GitHub", description: "Read repositories and manage pull requests." },
];
function ProviderCardsExample() {
  const [opened, setOpened] = useState("");
  return (
    <>
      <PluginCategorySection title="Productivity">
        {providers.map((provider) => (
          <PluginProviderCard
            key={provider.id}
            {...provider}
            onOpen={() => setOpened(provider.name)}
          />
        ))}
      </PluginCategorySection>
      {opened ? <p role="status">Opened {opened}</p> : null}
    </>
  );
}
export const ProviderCards: Story = { render: () => <ProviderCardsExample /> };
function AccountRowExample() {
  const [connected, setConnected] = useState(true);
  return (
    <ul className="m-0 list-none p-0">
      <PluginItemRow
        id="calendar"
        name="Personal calendar"
        description="Calendar access for this workspace."
        actions={
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={connected}
            onClick={() => setConnected((value) => !value)}
          >
            {connected ? "Disconnect" : "Connect"}
          </Button>
        }
      />
    </ul>
  );
}
export const AccountRow: Story = { render: () => <AccountRowExample /> };
function FiltersExample() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [scope, setScope] = useState<"all" | "personal" | "bots">("all");
  return (
    <div className="flex flex-wrap gap-3">
      <PluginSearchField label="Search tools" value={query} onChange={setQuery} />
      <PluginCategoryFilter
        categories={["productivity", "development"]}
        selectedCategory={category}
        onSelect={setCategory}
      />
      <ResourceScopeFilter value={scope} onChange={setScope} />
      <PluginAgentFilter
        agents={[{ id: "assistant", name: "Assistant" }]}
        selectedAgentIds={agents}
        onClear={() => setAgents([])}
        onToggle={(id) => setAgents((current) => (current.includes(id) ? [] : [id]))}
      />
    </div>
  );
}
export const Filters: Story = { render: () => <FiltersExample /> };
export const Loading: Story = { render: () => <PluginCatalogSkeleton kind="tools" /> };
function CustomCompositionExample() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(providers[0]!);
  const [connected, setConnected] = useState(true);
  return (
    <div className="grid gap-5">
      <PluginSearchField
        label="Search available tools"
        value={query}
        onChange={setQuery}
        className="w-full max-w-none flex-auto"
      />
      <PluginCategorySection title="Available tools" className="grid-cols-1">
        {providers
          .filter((item) =>
            `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((provider) => (
            <PluginProviderCard
              key={provider.id}
              {...provider}
              trailing={selected.id === provider.id ? <span>Selected</span> : null}
              onOpen={() => setSelected(provider)}
            />
          ))}
      </PluginCategorySection>
      <section aria-label="Selected tool">
        <h2 className="text-sm font-medium">{selected.name}</h2>
        <ul className="m-0 list-none rounded-xl border border-line p-2">
          <PluginItemRow
            id={selected.id}
            name="Workspace account"
            description={selected.description}
            actions={
              <Button
                size="sm"
                variant="secondary"
                aria-pressed={connected}
                onClick={() => setConnected((value) => !value)}
              >
                {connected ? "Enabled" : "Disabled"}
              </Button>
            }
          />
        </ul>
      </section>
    </div>
  );
}
export const CustomComposition: Story = { render: () => <CustomCompositionExample /> };
