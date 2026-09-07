import { ScrollToLatestButton } from "./workspace-shell.js";
import { ConversationMessage } from "./chat-components.js";
import { transcriptDayKey } from "@tryopenbot/client-runtime";
import { SearchIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

export interface ChatFindBarProps {
  query: string;
  matchCount: number;
  currentOrdinal: number;
  focusNonce?: number;
  autoFocus?: boolean;
  loading?: boolean;
  error?: string;
  onQueryChange: (query: string) => void;
  onStepNext: () => void;
  onStepPrevious: () => void;
  onClose: () => void;
}

export function ChatFindBar({
  query,
  matchCount,
  currentOrdinal,
  focusNonce = 0,
  autoFocus = true,
  loading = false,
  error,
  onQueryChange,
  onStepNext,
  onStepPrevious,
  onClose,
}: ChatFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusNonce, autoFocus]);

  return (
    <div className="chat-find-bar" role="search" aria-label="Find in this chat" aria-busy={loading}>
      <span aria-hidden="true" className="chat-find-icon">
        <SearchIcon aria-hidden />
      </span>
      <input
        aria-label="Find in chat"
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) onStepPrevious();
            else onStepNext();
          }
        }}
        placeholder="Find in chat"
        ref={inputRef}
        spellCheck={false}
        type="text"
        value={query}
      />
      {query.trim() ? (
        <span
          className={matchCount === 0 ? "empty" : ""}
          role="status"
          title={error}
          aria-label={error ? `Search failed: ${error}` : undefined}
        >
          {loading ? "…" : error ? "!" : `${currentOrdinal}/${matchCount}`}
        </span>
      ) : null}
      <i aria-hidden="true" />
      <button aria-label="Previous match" disabled={matchCount === 0} onClick={onStepPrevious}>
        ↑
      </button>
      <button aria-label="Next match" disabled={matchCount === 0} onClick={onStepNext}>
        ↓
      </button>
      <button aria-label="Close find" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function TranscriptLoading() {
  return <ConversationSkeleton />;
}

export function ConversationSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading conversation"
      className="conversation-loading conversation-skeleton"
      role="status"
    >
      <span className="sr-only">Loading conversation</span>
      <div className="conversation-skeleton-row assistant" aria-hidden="true">
        <span className="conversation-skeleton-bubble wide">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="conversation-skeleton-row user" aria-hidden="true">
        <span className="conversation-skeleton-bubble compact">
          <i />
          <i />
        </span>
      </div>
      <div className="conversation-skeleton-row assistant" aria-hidden="true">
        <span className="conversation-skeleton-bubble medium">
          <i />
          <i />
        </span>
      </div>
      <div className="conversation-skeleton-row user" aria-hidden="true">
        <span className="conversation-skeleton-bubble short">
          <i />
        </span>
      </div>
      <div className="conversation-skeleton-row assistant" aria-hidden="true">
        <span className="conversation-skeleton-bubble wide">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="conversation-skeleton-row user" aria-hidden="true">
        <span className="conversation-skeleton-bubble compact">
          <i />
          <i />
        </span>
      </div>
      <div className="conversation-skeleton-row assistant" aria-hidden="true">
        <span className="conversation-skeleton-bubble medium">
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

export interface NewMessagesPillProps {
  count: number;
  onJump: () => void;
}
export function NewMessagesPill({ count, onJump }: NewMessagesPillProps) {
  return <ScrollToLatestButton newMessageCount={count} onClick={onJump} />;
}

export function UnreadDivider() {
  return (
    <div aria-label="New messages" className="unread-divider" role="separator">
      <span aria-hidden="true" />
      <strong>New</strong>
      <span aria-hidden="true" />
    </div>
  );
}

export interface QueuedSendNoticeProps {
  transportDown?: boolean;
  cancellable?: boolean;
  onCancel?: () => void;
}

export function QueuedSendNotice({
  transportDown = true,
  cancellable = false,
  onCancel,
}: QueuedSendNoticeProps) {
  return (
    <div className="message-send-notice queued-send-notice" role="status">
      <span>{transportDown ? "Will send when reconnected" : "Waiting to send…"}</span>
      {cancellable && onCancel ? (
        <button onClick={onCancel} type="button">
          Cancel
        </button>
      ) : null}
    </div>
  );
}

export function SentWhileOfflineNotice({ composedAt }: { composedAt: Date | number | string }) {
  const date = composedAt instanceof Date ? composedAt : new Date(composedAt);
  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return (
    <div className="message-send-notice sent-while-offline-notice" role="status">
      <span>Sent while offline · {formatted}</span>
    </div>
  );
}

export interface FailedSendActionsProps {
  onResend: () => void;
  onDelete: () => void;
}

export function FailedSendActions({ onResend, onDelete }: FailedSendActionsProps) {
  return (
    <div aria-label="Failed message actions" className="message-send-notice" role="group">
      <span className="failed-send-label" role="status">
        Failed to send
      </span>
      <button onClick={onResend} type="button">
        Resend
      </button>
      <button onClick={onDelete} type="button">
        Delete
      </button>
    </div>
  );
}

export function TranscriptTimeSeparator({
  label,
  dateTime,
  now = new Date(),
}: {
  label?: string;
  dateTime?: string;
  now?: Date;
}) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = dateTime?.slice(0, 10);
  const date = day ? new Date(`${day}T12:00:00`) : undefined;
  const text =
    label ??
    (day === transcriptDayKey(now)
      ? "Today"
      : day === transcriptDayKey(yesterday)
        ? "Yesterday"
        : date && !Number.isNaN(date.valueOf())
          ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
          : "");
  return (
    <div className="transcript-time-separator" role="separator">
      <time dateTime={dateTime}>{text}</time>
    </div>
  );
}

export function SystemEvent({ children }: { children: ReactNode }) {
  return <div className="system-event">{children}</div>;
}

export function SystemEventLabel({
  children,
  tone = "secondary",
}: {
  children: ReactNode;
  tone?: "secondary" | "tertiary";
}) {
  return (
    <span className="system-event-label" data-tone={tone}>
      {children}
    </span>
  );
}

export function SystemEventChip({
  children,
  leading,
  onClick,
}: {
  children: ReactNode;
  leading?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      {leading ? <span aria-hidden="true">{leading}</span> : null}
      <span>{children}</span>
    </>
  );
  return onClick ? (
    <button className="system-event-chip" onClick={onClick} type="button">
      {content}
    </button>
  ) : (
    <span className="system-event-chip">{content}</span>
  );
}

export interface UnknownMessageCardProps {
  createdAt?: string;
  messageType: string;
  content?: ReactNode;
  variant?: "unknown" | "retired";
  productName?: string;
}

export function UnknownMessageCard({
  messageType,
  content,
  variant = "unknown",
  productName = "Dispatch",
  createdAt = "",
}: UnknownMessageCardProps) {
  const fullMessage =
    variant === "retired"
      ? `This message type is no longer supported in ${productName}.`
      : `This message can’t be shown in this version of ${productName}. Update ${productName} to see it.`;
  const shortMessage =
    variant === "retired" ? fullMessage : `Update ${productName} to see the full message.`;
  return (
    <ConversationMessage role="assistant" createdAt={createdAt} tone="warning">
      <div data-message-type={messageType}>
        {content ? (
          <>
            {content}
            <p>{shortMessage}</p>
          </>
        ) : (
          <p>{fullMessage}</p>
        )}
      </div>
    </ConversationMessage>
  );
}
