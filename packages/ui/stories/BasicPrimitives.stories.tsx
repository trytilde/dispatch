import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  ControlButton,
  Input,
  Textarea,
  InputGroup,
  SelectField,
  KeyboardKey,
} from "@tryopenbot/ui";
const meta = { title: "Primitives/Controls" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Buttons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="quiet">Quiet</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};
export const Inputs: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12, width: "min(420px, 90vw)" }}>
      <Input aria-label="Name" placeholder="Name" />
      <Textarea aria-label="Details" placeholder="Details" />
      <InputGroup ariaLabel="Search" placeholder="Search" />
      <SelectField
        ariaLabel="Environment"
        options={[
          { label: "Development", value: "dev" },
          { label: "Production", value: "prod" },
        ]}
      />
    </div>
  ),
};
export const Keys: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <KeyboardKey>⌘</KeyboardKey>
      <KeyboardKey>Ctrl</KeyboardKey>
      <KeyboardKey>Shift</KeyboardKey>
      <KeyboardKey>F</KeyboardKey>
      <KeyboardKey>Esc</KeyboardKey>
    </div>
  ),
};

export const FormButtons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <ControlButton>Save changes</ControlButton>
      <ControlButton variant="outline">Cancel</ControlButton>
      <ControlButton variant="ghost">More</ControlButton>
      <ControlButton disabled>Saving</ControlButton>
    </div>
  ),
};
