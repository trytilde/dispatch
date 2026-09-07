import { SessionSourceIcon } from "./session-source.js";
import type { PromptStatus, SessionAccess } from "@tryopenbot/client-runtime";
import { AnimatePresence, motion } from "motion/react";
import { XIcon, PlusIcon, ArrowUpIcon, ReplyIcon } from "lucide-react";
import { ActivityQueue, type ActivityQueueProps } from "./activity-queue.js";
import { ChatComposer, ChatComposerDock, type ChatComposerProps } from "./chat-composer.js";
import { ScrollToLatestButton } from "./workspace-shell.js";

export interface ChatPromptProps extends ChatComposerProps {
  status?: PromptStatus;
  access?: SessionAccess;
  joining?: boolean;
  onJoin?: () => void;
  queue?: ActivityQueueProps;
  showScrollToBottom?: boolean;
  newMessageCount?: number;
  onScrollToBottom?: () => void;
}

export function PromptStatusBadge({ status }: { status: PromptStatus }) {
  const label =
    status.message ??
    { unreachable: "Agent unreachable", failed: "Failed", "action-needed": "Action needed" }[
      status.kind
    ];
  return (
    <span className="prompt-status" data-kind={status.kind} role="status">
      <i aria-hidden />
      {label}
    </span>
  );
}

/** Complete floating prompt surface. Placement, reply, notices and queue have one owner. */
export function ChatPrompt({
  status,
  access = { kind: "enabled" },
  joining = false,
  onJoin,
  error,
  reply,
  queue,
  showScrollToBottom = false,
  newMessageCount = 0,
  onScrollToBottom,
  onCancelReply,
  ...composer
}: ChatPromptProps) {
  const showJump = (showScrollToBottom || newMessageCount > 0) && Boolean(onScrollToBottom);
  const problem = status ?? (error ? { kind: "failed" as const, message: error } : undefined);
  if (access.kind !== "enabled")
    return (
      <ChatComposerDock className="chat-prompt">
        {problem || showJump ? (
          <div className="prompt-notices">
            {showJump && onScrollToBottom ? (
              <ScrollToLatestButton onClick={onScrollToBottom} newMessageCount={newMessageCount} />
            ) : null}
            {problem ? <PromptStatusBadge status={problem} /> : null}
          </div>
        ) : null}
        <div className="composer-shell">
          <div className="composer prompt-restricted" aria-label="Session participation">
            <button type="button" disabled aria-label="Add photos and files">
              <PlusIcon aria-hidden />
            </button>
            <p>
              {access.kind === "external" ? (
                <>
                  Chat sessions can only be messaged from{" "}
                  <span className="prompt-source-label">
                    <SessionSourceIcon source={access.source} />
                    {access.source.name}
                  </span>
                  .
                </>
              ) : access.kind === "join-required" ? (
                <>
                  You must join this session to be able to participate. To join, click{" "}
                  <a
                    href="#join-session"
                    className="prompt-join-link"
                    aria-disabled={joining || !onJoin}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!joining) onJoin?.();
                    }}
                  >
                    {joining ? "joining…" : "here"}
                  </a>
                  .
                </>
              ) : access.kind === "checking" ? (
                "Checking session participation…"
              ) : (
                access.message
              )}
            </p>
            <button type="button" disabled aria-label="Send message">
              <ArrowUpIcon aria-hidden />
            </button>
          </div>
        </div>
      </ChatComposerDock>
    );
  return (
    <ChatComposerDock className="chat-prompt">
      <AnimatePresence mode="wait" initial={false}>
        {reply ? (
          <motion.div
            key="reply"
            className="prompt-reply"
            aria-label="Replying to message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            <ReplyIcon className="prompt-reply-icon" aria-hidden />
            <div>
              <strong>{reply.label}</strong>
              <p>{reply.text}</p>
            </div>
            <button type="button" aria-label="Cancel reply" onClick={onCancelReply}>
              <XIcon aria-hidden />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="controls"
            className="prompt-above"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            {problem || showJump ? (
              <div className="prompt-notices">
                {showJump && onScrollToBottom ? (
                  <ScrollToLatestButton
                    onClick={onScrollToBottom}
                    newMessageCount={newMessageCount}
                  />
                ) : null}
                {problem ? <PromptStatusBadge status={problem} /> : null}
              </div>
            ) : null}
            {queue ? <ActivityQueue {...queue} /> : null}
          </motion.div>
        )}
      </AnimatePresence>
      <ChatComposer {...composer} onCancelReply={onCancelReply} />
    </ChatComposerDock>
  );
}
