import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createOpenBotClient, createSessionRuntime } from "@tryopenbot/client-runtime";
import { StoryPrompt } from "./chat-preview.js";
import { apiSource, slackSource, assistant, alex } from "./session-fixtures.js";
const meta = {
  title: "Chat/Controls/Prompt",
  parameters: { layout: "fullscreen", chatPlacement: "prompt" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const ExternalSession: Story = {
  parameters: {
    chatHeader: {
      source: slackSource,
      sessionName: "Launch review",
      participants: [assistant, alex],
    },
  },
  render: () => <StoryPrompt access={{ kind: "external", source: slackSource }} />,
};
function JoinExample({ denied = false }: { denied?: boolean }) {
  const runtime = useMemo(() => {
    let joined = false;
    const participant = (userId: string) => ({
      participant_type: "human",
      participant_handle: userId,
      membership_source: "explicit",
      role: "member",
      principal_user_id: userId,
      joined_at: "2026-09-07",
      inbox: { id: "example-api-inbox", provider_id: "chatkit.channel.vercel-ui" },
      instance: { id: `${userId}-instance`, user_display_name: userId === "me" ? "You" : "Alex" },
    });
    const client = createOpenBotClient({
      fetch: async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith("/chat-channels")) return Response.json([]);
        if (url.endsWith("/join") && init?.method === "POST") {
          if (denied)
            return Response.json(
              { message: "This session could not accept your join request." },
              { status: 403 },
            );
          joined = true;
          return Response.json(participant("me"));
        }
        if (url.endsWith("/participants"))
          return Response.json([participant("alex"), ...(joined ? [participant("me")] : [])]);
        return Response.json({ items: [] });
      },
    });
    return createSessionRuntime(client, {
      getAgents: () => [],
      getCurrentUser: () => ({ subject: "me", name: "You" }),
      onRenamed: () => undefined,
      onFindMessage: async () => undefined,
    });
  }, [denied]);
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getState,
    runtime.store.getInitialState,
  );
  useEffect(() => {
    runtime.select("example-session");
    return () => runtime.dispose();
  }, [runtime]);
  return (
    <StoryPrompt
      access={state.access}
      joining={state.joining}
      onJoin={() => void runtime.join()}
      status={state.joinError ? { kind: "failed", message: state.joinError } : undefined}
    />
  );
}
export const JoinSession: Story = {
  parameters: {
    chatHeader: { source: apiSource, participants: [assistant, alex], sessionName: "Team chat" },
  },
  render: () => <JoinExample />,
};
export const JoinRejected: Story = {
  parameters: {
    chatHeader: { source: apiSource, participants: [assistant, alex], sessionName: "Team chat" },
  },
  render: () => <JoinExample denied />,
};
