import { AgentAvatar } from "./agent-avatar.js";
import { SearchIcon } from "./workspace-icons.js";

export interface SidebarAgent {
  id: string;
  name: string;
  status: string;
  updatedAt?: string;
  unread?: boolean;
}

export interface AgentListItemProps {
  agent: SidebarAgent;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function AgentListItem({ agent, selected, onSelect }: AgentListItemProps) {
  return (
    <button
      className={selected ? "agent-row active" : "agent-row"}
      onClick={() => onSelect(agent.id)}
      title={agent.name}
      type="button"
    >
      <AgentAvatar id={agent.id} unread={agent.unread} />
      <span className="agent-row-body">
        <span className="agent-row-title">
          <strong>{agent.name}</strong>
          {agent.updatedAt ? (
            <time dateTime={agent.updatedAt}>{relativeTime(agent.updatedAt)}</time>
          ) : null}
        </span>
        <small>{agent.status || "Ready"}</small>
      </span>
    </button>
  );
}

export interface AgentSearchDialogProps {
  agents: readonly SidebarAgent[];
  loading: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function AgentSearchDialog({
  agents,
  loading,
  value,
  onChange,
  onClose,
  onSelect,
}: AgentSearchDialogProps) {
  return (
    <div className="sidebar-search-overlay" onMouseDown={onClose} role="presentation">
      <section
        aria-label="Search agents"
        aria-modal="true"
        className="sidebar-search-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <label>
          <SearchIcon />
          <input
            aria-label="Search agents"
            autoFocus
            onChange={(event) => onChange(event.target.value)}
            placeholder="Search agents"
            value={value}
          />
        </label>
        <div className="sidebar-search-results">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                onClose();
                onSelect(agent.id);
              }}
              type="button"
            >
              <AgentAvatar id={agent.id} />
              <span>
                <strong>{agent.name}</strong>
                <small>{agent.status || "Ready"}</small>
              </span>
            </button>
          ))}
          {!loading && agents.length === 0 ? <p>No agents found</p> : null}
        </div>
      </section>
    </div>
  );
}

export function WorkspaceAccount({ status }: { status: string }) {
  return (
    <button className="rail-footer" type="button">
      <span className="footer-avatar">O</span>
      <span>
        <strong>OpenBot</strong>
        <small>
          <i className={`status-dot ${status.toLowerCase()}`} /> {status}
        </small>
      </span>
    </button>
  );
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).valueOf();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}
