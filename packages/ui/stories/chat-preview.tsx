import type { PromptStatus, SessionAccess } from "@tryopenbot/client-runtime";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import {
  ChatPrompt,
  TranscriptTimeSeparator,
  ChatEventSurface,
  ChatHeader,
  ChatPane,
  ConversationMessage,
  ConversationSurface,
  type ComposerAttachment,
  type ComposerReply,
  type ActivityQueueProps,
  type ChatHeaderProps,
} from "@tryopenbot/ui";

export type ChatStoryPlacement =
  | "event"
  | "message"
  | "conversation"
  | "transcript"
  | "control"
  | "queue"
  | "prompt"
  | "header"
  | "find";

const ChatExampleContext = createContext<{
  inChat: boolean;
  send?: (text: string) => void;
  scrollToBottom?: () => void;
}>({ inChat: false });
export const useChatExample = () => useContext(ChatExampleContext).inChat;

/** Story-only composition. Every visual surface comes from the package exports. */
export function StoryPrompt({
  initialDraft = "",
  busy = false,
  expanded = false,
  error,
  attachments = [],
  reply,
  onSend,
  status,
  access,
  joining,
  onJoin,
  queue,
  showScrollToBottom = false,
  newMessageCount = 0,
}: {
  initialDraft?: string;
  busy?: boolean;
  expanded?: boolean;
  error?: string;
  attachments?: readonly ComposerAttachment[];
  reply?: ComposerReply;
  onSend?: (text: string) => void;
  status?: PromptStatus;
  access?: SessionAccess;
  joining?: boolean;
  onJoin?: () => void;
  queue?: ActivityQueueProps;
  showScrollToBottom?: boolean;
  newMessageCount?: number;
}) {
  const example = useContext(ChatExampleContext);
  const [draft, setDraft] = useState(initialDraft);
  const [files, setFiles] = useState([...attachments]);
  const [replying, setReplying] = useState(reply);
  const inputRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <ChatPrompt
      status={status}
      access={access}
      joining={joining}
      onJoin={onJoin}
      queue={queue}
      showScrollToBottom={showScrollToBottom}
      newMessageCount={newMessageCount}
      onScrollToBottom={() => example.scrollToBottom?.()}
      agentAvailable
      busy={busy}
      submitting={false}
      dragging={false}
      expanded={expanded || draft.includes("\n")}
      draft={draft}
      attachments={files}
      {...(error ? { error } : {})}
      {...(replying ? { reply: replying } : {})}
      inputRef={inputRef}
      fileInputRef={fileInputRef}
      onDraftChange={setDraft}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() || files.length) {
          (onSend ?? example.send)?.(draft.trim() || "Shared an attachment");
          setDraft("");
          setFiles([]);
          setReplying(undefined);
        }
      }}
      onDragStateChange={() => undefined}
      onFilesAdded={(added) =>
        setFiles((current) => [
          ...current,
          ...Array.from(added, (file, index) => ({
            id: `${file.name}-${index}`,
            name: file.name,
            size: file.size,
            progress: 0,
            status: "ready" as const,
          })),
        ])
      }
      onRemoveAttachment={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
      onCancelReply={() => setReplying(undefined)}
      onStop={() => undefined}
    />
  );
}

function ChatExample({
  sample,
  placement,
  header,
  replaceAssistant = false,
  replaceHistory = false,
  centerTranscript = false,
}: {
  sample: ReactNode;
  placement: ChatStoryPlacement;
  header?: Partial<ChatHeaderProps>;
  replaceAssistant?: boolean;
  replaceHistory?: boolean;
  centerTranscript?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sent, setSent] = useState<string[]>([]);
  const renderInBody = ["message", "event", "conversation", "transcript"].includes(placement);
  return (
    <ChatExampleContext.Provider
      value={{
        inChat: true,
        send: (text) => setSent((current) => [...current, text]),
        scrollToBottom: () =>
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      }}
    >
      <div
        className="chat-story-context rich-chat"
        data-chat-example
        data-transcript-example={centerTranscript || undefined}
      >
        <ChatPane>
          {placement === "header" ? (
            sample
          ) : (
            <ChatHeader
              agentId="storybook-assistant"
              agentName="Assistant"
              source={{
                kind: "api",
                providerId: "chatkit.channel.vercel-ui",
                name: "API",
                inboxId: "example-api-inbox",
              }}
              participants={[
                {
                  id: "storybook-assistant",
                  agentId: "storybook-assistant",
                  kind: "agent",
                  name: "Assistant",
                },
              ]}
              {...header}
            />
          )}
          <div className="chat-story-body">
            {placement === "find" ? sample : null}
            <ConversationSurface scrollRef={scrollRef} onScroll={() => undefined}>
              <div className="message-list">
                {!replaceHistory ? (
                  <>
                    <TranscriptTimeSeparator dateTime="2026-09-07" />
                    <ConversationMessage role="user" createdAt="2026-09-07T10:00:00Z">
                      Help me review the latest changes.
                    </ConversationMessage>
                    {!replaceAssistant ? (
                      <ConversationMessage role="agent" createdAt="2026-09-07T10:00:12Z">
                        I’ve reviewed the changes. Here’s what I found.
                      </ConversationMessage>
                    ) : null}
                  </>
                ) : null}
                {renderInBody ? (
                  <div className="chat-story-subject" data-story-sample>
                    {placement === "message" ? (
                      <ConversationMessage role="agent" createdAt="2026-09-07T10:00:15Z">
                        {sample}
                      </ConversationMessage>
                    ) : placement === "event" ? (
                      <ChatEventSurface>{sample}</ChatEventSurface>
                    ) : (
                      sample
                    )}
                  </div>
                ) : null}
                {sent.map((text, index) => (
                  <ConversationMessage key={index} role="user" createdAt="2026-09-07T10:01:00Z">
                    {text}
                  </ConversationMessage>
                ))}
              </div>
            </ConversationSurface>
          </div>
          {placement === "prompt" ? sample : <StoryPrompt />}
        </ChatPane>
      </div>
    </ChatExampleContext.Provider>
  );
}

export function ChatStoryLayout({
  standalone,
  example,
  placement,
  header,
  replaceAssistant = false,
  replaceHistory = false,
  centerTranscript = false,
}: {
  standalone: ReactNode;
  example: ReactNode;
  placement: ChatStoryPlacement;
  header?: Partial<ChatHeaderProps>;
  replaceAssistant?: boolean;
  replaceHistory?: boolean;
  centerTranscript?: boolean;
}) {
  return (
    <div className="chat-story-layout" data-transcript-example={centerTranscript || undefined}>
      <section className="chat-story-section" aria-label="Standalone component">
        <h2 className="chat-story-label">Standalone</h2>
        <div className="chat-story-isolated rich-chat" data-story-sample>
          {standalone}
        </div>
      </section>
      <section className="chat-story-section" aria-label="Full chat example">
        <h2 className="chat-story-label">In a chat</h2>
        <ChatExample
          sample={example}
          placement={placement}
          header={header}
          replaceAssistant={replaceAssistant}
          replaceHistory={replaceHistory}
          centerTranscript={centerTranscript}
        />
      </section>
    </div>
  );
}
