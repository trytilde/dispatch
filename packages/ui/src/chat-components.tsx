import { SessionSourceBadge } from "./session-source.js";
import { useId, useState } from "react";
import { PencilIcon, UsersRoundIcon } from "lucide-react";
import type { SessionParticipant, SessionSource } from "@tryopenbot/client-runtime";
import { SessionIcon } from "./participant-avatars.js";
import { DialogSurface } from "./overlay-components.js";
import { ChatFindBar, type ChatFindBarProps } from "./transcript-components.js";
import type { ReactNode } from "react";
import { MenuIcon, WaypointsIcon } from "lucide-react";
import { AgentAvatar } from "./agent-avatar.js";
import { LoaderGrid, useElapsed } from "./beautiful-ui/blocks/loader-grid.js";
import { Button } from "./components/ui/button.js";
import { ComputerIcon } from "./workspace-icons.js";

export interface ChatHeaderProps {
  agentId?: string;
  agentName?: string;
  participants?: readonly SessionParticipant[];
  currentUserId?: string;
  sessionName?: string;
  source?: SessionSource;
  find?: ChatFindBarProps;
  onRenameSession?: (title: string) => Promise<void>;
  onManageParticipants?: () => void;
  /** Agent is mid-turn — the avatar spins its orbit. */
  busy?: boolean;
  computerOpen?: boolean;
  onToggleComputer?: () => void;
  onOpenSidebar?: () => void;
  detailsOpen?: boolean;
  onToggleDetails?: (() => void) | undefined;
}

export function ChatHeader({
  agentId,
  agentName = "Assistant",
  participants,
  currentUserId,
  sessionName,
  source,
  find,
  onRenameSession,
  onManageParticipants,
  busy = false,
  computerOpen,
  onToggleComputer,
  onOpenSidebar,
  detailsOpen = false,
  onToggleDetails,
}: ChatHeaderProps) {
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const others =
    participants?.filter((participant) => !currentUserId || participant.userId !== currentUserId) ??
    [];
  const names = others.length
    ? others.map((participant) => participant.name).join(", ")
    : agentName;
  async function rename() {
    if (!onRenameSession || !draftName.trim() || saving) return;
    setSaving(true);
    setRenameError("");
    try {
      await onRenameSession(draftName.trim());
      setEditing(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Could not rename this chat");
    } finally {
      setSaving(false);
    }
  }
  return (
    <header className="chat-header" data-find-open={Boolean(find) || undefined}>
      {onOpenSidebar ? (
        <Button
          aria-label="Open navigation"
          className="mobile-sidebar-trigger size-11 rounded-control"
          onClick={onOpenSidebar}
          size="icon"
          type="button"
          variant="ghost"
        >
          <MenuIcon aria-hidden className="size-5" />
        </Button>
      ) : null}
      <div className="chat-identity">
        {participants?.length ? (
          <SessionIcon participants={participants} currentUserId={currentUserId} />
        ) : agentId ? (
          <AgentAvatar id={agentId} state={busy ? "working" : "idle"} />
        ) : (
          <span className="agent-avatar">{agentName.charAt(0).toUpperCase()}</span>
        )}
        <div className="chat-title">
          <h2 title={sessionName ? `${names} · ${sessionName}` : names}>
            <span className="chat-participant-names">{names}</span>
            {onManageParticipants ? (
              <button
                className="chat-people-edit"
                type="button"
                aria-label="Manage participants"
                onClick={onManageParticipants}
              >
                <UsersRoundIcon aria-hidden />
              </button>
            ) : null}
            {source ? <SessionSourceBadge source={source} /> : null}
            {sessionName ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{sessionName}</span>
              </>
            ) : null}
          </h2>
          {onRenameSession ? (
            <button
              type="button"
              className="chat-name-edit"
              aria-label="Edit chat name"
              onClick={() => {
                setDraftName(sessionName ?? "");
                setRenameError("");
                setEditing(true);
              }}
            >
              <PencilIcon aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {find ? (
        <div className="chat-header-find">
          <ChatFindBar {...find} />
        </div>
      ) : null}
      <div className="chat-actions" hidden={Boolean(find)}>
        {onToggleDetails ? (
          <button
            aria-expanded={detailsOpen}
            aria-label="Toggle routines"
            className={detailsOpen ? "active" : ""}
            onClick={onToggleDetails}
            title="Toggle routines (Ctrl+Alt+D)"
          >
            <WaypointsIcon aria-hidden />
          </button>
        ) : null}
        {onToggleComputer ? (
          <button
            aria-expanded={computerOpen}
            aria-label="Toggle Computer pane"
            className={computerOpen ? "active" : ""}
            onClick={onToggleComputer}
            title="Toggle Computer pane (Ctrl+Alt+B)"
          >
            <ComputerIcon />
          </button>
        ) : null}
      </div>
      {editing ? (
        <DialogSurface
          open
          title="Edit chat name"
          onClose={() => !saving && setEditing(false)}
          actions={
            <>
              <button type="button" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                className="primary"
                type="submit"
                form={formId}
                disabled={saving || !draftName.trim()}
              >
                Save
              </button>
            </>
          }
        >
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void rename();
            }}
          >
            <label className="session-name-field">
              Chat name
              <input
                autoFocus
                aria-label="Chat name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
            {renameError ? <p role="alert">{renameError}</p> : null}
          </form>
        </DialogSurface>
      ) : null}
    </header>
  );
}

export interface ConversationMessageProps {
  tone?: "warning";
  attachments?: ReactNode;
  notice?: ReactNode;
  messageId?: string;
  role: string;
  createdAt: string;
  continuedPrevious?: boolean;
  continuedNext?: boolean;
  /** Message is attachments only — the bubble renders bare. */
  mediaOnly?: boolean;
  children: ReactNode;
}

export function ConversationMessage({
  notice,
  tone,
  attachments,
  messageId,
  role,
  createdAt,
  continuedPrevious = false,
  continuedNext = false,
  mediaOnly = false,
  children,
}: ConversationMessageProps) {
  return (
    <article
      data-message-id={messageId}
      data-tone={tone}
      aria-label={role === "user" ? "Your message" : "Agent message"}
      className={`message ${role} ${continuedPrevious ? "continued-previous" : "group-start"} ${continuedNext ? "continued-next" : ""} ${mediaOnly ? "media-only" : ""}`}
    >
      {children ? <div className="message-bubble">{children}</div> : null}
      {attachments ? <div className="message-attachments">{attachments}</div> : null}
      {notice ? <div className="message-notice">{notice}</div> : null}
      <div className="message-footer">
        <time dateTime={createdAt}>{formatTime(createdAt)}</time>
      </div>
    </article>
  );
}

export function ThinkingIndicator({ children }: { children: ReactNode }) {
  const elapsed = useElapsed();
  return (
    <div className="thinking-inline" role="status">
      <LoaderGrid variant="drive" />
      <span
        className="bg-clip-text text-[13px] font-medium text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
          backgroundSize: "200% 100%",
          animation: "shimmer-text 1.4s linear infinite",
        }}
      >
        {children}
      </span>
      <span className="font-mono text-[12px] text-ink-3 tabular-nums">{elapsed}</span>
    </div>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
