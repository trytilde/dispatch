import type { Preview } from "@storybook/react-vite";
import { ChatStoryLayout, type ChatStoryPlacement } from "../stories/chat-preview.js";
import "../src/beautiful-ui/upstream/globals.css";
import "../src/openbot-ui.css";
import "../stories/chat-preview.css";

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
    options: {
      storySort: {
        order: [
          "Chat",
          ["Controls", ["Queue", "Prompt", "Header", "*"], "Messages", "Events"],
          "Primitives",
          "Dispatch",
        ],
      },
    },
    layout: "centered",
  },
  decorators: [
    (Story, context) => (
      <div className="openbot-storybook-root">
        {context.title.startsWith("Chat/") && !context.parameters.chatOwnLayout ? (
          <ChatStoryLayout
            placement={
              (context.parameters.chatPlacement ??
                (context.title.startsWith("Chat/Controls")
                  ? "prompt"
                  : context.title.startsWith("Chat/Events")
                    ? "event"
                    : "message")) as ChatStoryPlacement
            }
            header={context.parameters.chatHeader}
            replaceAssistant={context.parameters.chatReplaceAssistant}
            replaceHistory={context.parameters.chatReplaceHistory}
            centerTranscript={context.title === "Chat/Events/Transcript"}
            standalone={<Story />}
            example={<Story />}
          />
        ) : (
          <Story />
        )}
      </div>
    ),
  ],
};

export default preview;
