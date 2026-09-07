import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

addons.setConfig({
  theme: create({
    base: "light",
    brandTitle: "Dispatch",
    brandUrl: "/?path=/story/chat-controls-prompt--default",
    brandTarget: "_self",
  }),
});
