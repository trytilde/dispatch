import type { Preview } from "@storybook/react-vite";
// @ts-expect-error Storybook's Vite renderer loads package CSS as a side effect.
import "../src/beautiful-ui/upstream/globals.css";
// @ts-expect-error Storybook's Vite renderer loads package CSS as a side effect.
import "../src/dispatch-ui.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "Dispatch",
      values: [
        { name: "Dispatch", value: "#f5f5f3" },
        { name: "Surface", value: "#fbfbfa" },
        { name: "Dark", value: "#171717" },
      ],
    },
    controls: { expanded: true },
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="dispatch-storybook-root">
        <Story />
      </div>
    ),
  ],
};

export default preview;
