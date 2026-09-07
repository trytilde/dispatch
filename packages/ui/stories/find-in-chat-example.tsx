import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createOpenBotClient,
  createSessionRuntime,
  isChatFindShortcut,
  type ChatMessage as Message,
} from "@tryopenbot/client-runtime";
import {
  ChatFindBar,
  ChatHeader,
  ChatPane,
  ConversationSurface,
  ChatMessage,
  useChatFindHighlight,
} from "@tryopenbot/ui";
import { StoryPrompt } from "./chat-preview.js";
import { assistant, apiSource } from "./session-fixtures.js";
const history: Message[] = Array.from({ length: 24 }, (_, index) => ({
  id: `find-${index}`,
  session_id: "find-example",
  type: "ui",
  role: index % 2 ? "assistant" : "user",
  created_at: "2026-09-07T10:00:00Z",
  parts: [
    {
      type: "text",
      text:
        index === 2
          ? "The earlier launch plan contains **important changes**."
          : index === 20
            ? "I reviewed the latest changes."
            : `Review note ${index + 1}: everything is ready for the next step.`,
    },
  ],
}));
export function FindChatExample() {
  const [visible, setVisible] = useState(history.slice(-7));
  const [loadedOlder, setLoadedOlder] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const runtime = useMemo(
    () =>
      createSessionRuntime(
        createOpenBotClient({
          fetch: async (input) => {
            const url = new URL(
              typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
              "https://storybook.test",
            );
            if (url.pathname.endsWith("/search")) {
              const query = (url.searchParams.get("q") ?? "").toLowerCase();
              const items =
                url.searchParams.get("session_id") === "find-example"
                  ? history
                      .filter((message) =>
                        message.parts?.some((part) => part.text?.toLowerCase().includes(query)),
                      )
                      .map((message) => ({
                        kind: "message",
                        message,
                        session: {
                          id: "find-example",
                          created_at: message.created_at,
                          updated_at: message.created_at,
                        },
                      }))
                  : [];
              return Response.json({ items });
            }
            return Response.json([]);
          },
        }),
        {
          getAgents: () => [],
          onRenamed: () => undefined,
          onFindMessage: async (hit) => {
            if (
              history.findIndex((message) => message.id === hit.message?.id) <
              history.length - 7
            ) {
              setVisible(history);
              setLoadedOlder(true);
            }
          },
        },
      ),
    [],
  );
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getState,
    runtime.store.getInitialState,
  );
  useEffect(() => {
    runtime.select("find-example");
    runtime.openFind();
    void runtime.search("changes");
    return () => runtime.dispose();
  }, [runtime]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (isChatFindShortcut(event)) {
        event.preventDefault();
        runtime.openFind();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [runtime]);
  const find = {
    query: state.find.query,
    matchCount: state.find.items.length,
    currentOrdinal: state.find.activeIndex + 1,
    autoFocus: false,
    loading: state.find.status === "loading",
    error: state.find.error,
    onQueryChange: runtime.setFindQuery,
    onStepNext: () => void runtime.stepFind(1),
    onStepPrevious: () => void runtime.stepFind(-1),
    onClose: runtime.closeFind,
  };
  useChatFindHighlight({
    rootRef,
    query: state.find.open ? state.find.query : "",
    messageId: state.find.items[state.find.activeIndex]?.message?.id,
    focusNonce: state.find.resultFocusNonce,
    revision: visible,
  });
  return (
    <div className="chat-story-layout rich-chat">
      <section className="chat-story-section">
        <h3 className="chat-story-label">Standalone</h3>
        <ChatFindBar {...find} />
      </section>
      <section className="chat-story-section">
        <h3 className="chat-story-label">In a chat</h3>
        <div className="chat-story-context">
          <ChatPane>
            <ChatHeader
              participants={[assistant]}
              source={apiSource}
              find={state.find.open ? find : undefined}
            />
            <div className="chat-story-body">
              <ConversationSurface scrollRef={rootRef} onScroll={() => undefined}>
                <div className="message-list">
                  {loadedOlder ? (
                    <span className="chat-find-history-note" role="status">
                      Earlier messages loaded
                    </span>
                  ) : null}
                  {visible.map((message) => (
                    <ChatMessage
                      key={message.id}
                      messageId={message.id}
                      role={message.role}
                      createdAt={message.created_at}
                      message={message}
                      resolveAttachmentUrl={async () => ""}
                    />
                  ))}
                </div>
              </ConversationSurface>
            </div>
            <StoryPrompt />
          </ChatPane>
        </div>
      </section>
    </div>
  );
}
