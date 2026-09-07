import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createChatConnectorRuntime, type ConnectorProvider } from "@tryopenbot/client-runtime";
import { ConnectorEnableCard, ChatConnectorDialog } from "@tryopenbot/ui";

type SetupType = "OAuth" | "Managed credentials" | "Instructions" | "Retry" | "Download";
const meta = {
  args: { setupType: "OAuth" },
  argTypes: {
    setupType: {
      control: "radio",
      options: ["OAuth", "Managed credentials", "Instructions", "Retry", "Download"],
    },
  },
  title: "Chat/Events/Connections",
  parameters: { layout: "fullscreen", chatPlacement: "event" },
} satisfies Meta;
export default meta;
type Story = StoryObj<{ setupType: SetupType }>;

function EnableExample({ setupType }: { setupType: SetupType }) {
  const oauth = setupType === "OAuth" || setupType === "Retry";
  const name = oauth ? "GitHub" : "Tavily";
  const provider: ConnectorProvider = useMemo(
    () => ({
      type_id: oauth ? "github" : "tavily",
      name,
      icon_url: oauth
        ? new URL("../src/assets/channels/github.svg", import.meta.url).href
        : undefined,
      credential_sources: [],
    }),
    [oauth, name],
  );
  const runtime = useMemo(() => {
    let attempts = 0;
    return createChatConnectorRuntime(
      {
        createConnectorSetupTransport: () => ({
          start: async () => ({
            setup_id: "example-setup",
            resource: { id: "example-account" },
            next_action: oauth
              ? { type: "redirect", url: "https://example.test/oauth" }
              : setupType === "Instructions"
                ? {
                    type: "render_instructions",
                    markdown: "Confirm the workspace in your provider's settings, then continue.",
                    fields: [
                      { name: "workspace", label: "Workspace", field_type: "text", required: true },
                    ],
                  }
                : setupType === "Download"
                  ? { type: "download_secret_outputs" }
                  : {
                      type: "submit_form",
                      fields: [
                        {
                          name: "api_key",
                          label: "API key",
                          field_type: "password",
                          required: true,
                        },
                      ],
                      submit_label: "Connect",
                    },
          }),
          resume: async () => {
            if (setupType === "Retry" && attempts++ === 0)
              throw new Error("Authorization failed. Finish authorization and try again.");
            return {
              setup_id: "example-setup",
              resource: { id: "example-account", status: "active" },
              next_action: { type: "complete" },
            };
          },
          consumeSecretOutputs: () => ({ example: "This preview contains no credentials." }),
        }),
      },
      {
        openAuthorization: () => {},
        returnUrl: () => "https://example.test/connected",
        saveSecretOutputs: (outputs) => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(outputs)], { type: "application/json" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "example-provider.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      },
    );
  }, [oauth, setupType]);
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getState,
    runtime.store.getInitialState,
  );
  const setup = useSyncExternalStore(
    runtime.setup.store.subscribe,
    runtime.setup.store.getState,
    runtime.setup.store.getInitialState,
  );
  useEffect(() => () => runtime.dispose(), [runtime]);
  return (
    <>
      <ConnectorEnableCard
        providerName={name}
        iconUrl={provider.icon_url}
        enabled={Boolean(state.completedAccountId)}
        onEnable={() =>
          void runtime.openRequest(
            {
              provider_type_id: provider.type_id,
              provider_name: name,
              icon_url: provider.icon_url,
              resource_id: "example-account",
              hosted_url: "https://example.test/setup",
              target: {
                kind: "personal",
                user_id: "example-user",
                mcp_server_instance_id: "user-tools",
              },
            },
            "example-user",
          )
        }
      />
      <ChatConnectorDialog
        state={state}
        setup={setup}
        onClose={runtime.close}
        onSubmit={(input) => void runtime.submit(input)}
        onResume={(input) => void runtime.resume(input)}
        onRetry={runtime.retry}
        onDownloadOutputs={() => void runtime.downloadOutputs()}
        onReopenAuthorization={() => runtime.reopenAuthorization()}
      />
    </>
  );
}
export const Enable: Story = {
  render: (args) => <EnableExample key={args.setupType} setupType={args.setupType} />,
};
