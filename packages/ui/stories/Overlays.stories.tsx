import type { Meta, StoryObj } from "@storybook/react-vite";
import { DialogSurface } from "@tryopenbot/ui";

const meta = { title: "Dispatch/Overlays" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const noop = () => undefined;

export const Dialog: Story = {
  render: () => (
    <DialogSurface
      actions={
        <>
          <button>Cancel</button>
          <button className="primary">Continue</button>
        </>
      }
      description="Review the details before continuing."
      onClose={noop}
      open
      title="Confirm action"
    >
      <p>This surface can contain any focused workflow.</p>
    </DialogSurface>
  ),
};
