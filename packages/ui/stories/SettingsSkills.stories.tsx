import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  Button,
  PluginProviderCard,
  PluginItemRow,
  PluginCategorySection,
  PluginSearchField,
} from "@tryopenbot/ui";
const meta = {
  title: "Dispatch/Settings/Skills",
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
function SkillsExample({ provider = false }: { provider?: boolean }) {
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState<string[]>(["review"]);
  const [opened, setOpened] = useState(!provider);
  const skills = [
    {
      id: "review",
      name: "Code review",
      description: "Review changes for correctness and useful test coverage.",
    },
    {
      id: "writing",
      name: "Clear writing",
      description: "Produce concise descriptions and summaries.",
    },
  ];
  return (
    <div className="grid gap-4">
      {provider ? (
        <PluginCategorySection title="Skill collections">
          <PluginProviderCard
            id="essentials"
            name="Essentials"
            description="2 skills · Reusable review and writing capabilities."
            onOpen={() => setOpened((value) => !value)}
          />
        </PluginCategorySection>
      ) : null}
      {opened ? (
        <>
          <PluginSearchField
            label="Search skills"
            value={query}
            onChange={setQuery}
            className="w-full max-w-none flex-auto"
          />
          <ul className="m-0 list-none p-0">
            {skills
              .filter((skill) =>
                `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase()),
              )
              .map((skill) => (
                <PluginItemRow
                  key={skill.id}
                  {...skill}
                  showIcon={false}
                  multilineDescription
                  actions={
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-pressed={enabled.includes(skill.id)}
                      onClick={() =>
                        setEnabled((current) =>
                          current.includes(skill.id)
                            ? current.filter((id) => id !== skill.id)
                            : [...current, skill.id],
                        )
                      }
                    >
                      {enabled.includes(skill.id) ? "Enabled" : "Enable"}
                    </Button>
                  }
                />
              ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
export const SkillRows: Story = { render: () => <SkillsExample /> };
export const CollectionComposition: Story = { render: () => <SkillsExample provider /> };
