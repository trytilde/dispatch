import type { PointerEvent as ReactPointerEvent } from "react";
import { AgentAvatar } from "./agent-avatar.js";
import { SearchIcon } from "./workspace-icons.js";

export interface WorkspaceSidebarAgent {
  id: string;
  name: string;
  status: string;
  updatedAt?: string;
  unread?: boolean;
}

export interface WorkspaceSidebarProps {
  agents: readonly WorkspaceSidebarAgent[];
  selectedAgentId: string;
  loading?: boolean;
  hasMore?: boolean;
  streamStatus: string;
  searchOpen: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSelectAgent: (id: string) => void;
  onLoadMore?: () => void;
  onResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function WorkspaceSidebar({
  agents,
  selectedAgentId,
  loading = false,
  hasMore = false,
  streamStatus,
  searchOpen,
  searchValue,
  onSearchChange,
  onSearchOpen,
  onSearchClose,
  onSelectAgent,
  onLoadMore,
  onResize,
}: WorkspaceSidebarProps) {
  return (
    <>
      <aside className="rail">
        <div className="sidebar-titlebar" />
        <button
          aria-label="Search"
          className="chat-search"
          onClick={onSearchOpen}
          onKeyDown={(event) => {
            if (
              !event.defaultPrevented &&
              event.key.length === 1 &&
              event.key !== " " &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            ) {
              event.preventDefault();
              onSearchOpen();
            }
          }}
          type="button"
        >
          <span>
            <SearchIcon />
            Search
          </span>
        </button>
        <nav className="agent-navigation">
          {loading ? <p className="agent-status">Loading agents…</p> : null}
          {!loading && agents.length === 0 ? (
            <p className="agent-status">No agents are available.</p>
          ) : null}
          {agents.map((agent) => (
            <button
              className={agent.id === selectedAgentId ? "agent-row active" : "agent-row"}
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              title={agent.name}
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
          ))}
          {hasMore && !searchValue && onLoadMore ? (
            <button className="load-more-agents" onClick={onLoadMore}>
              Show more agents
            </button>
          ) : null}
        </nav>
        <button className="rail-footer" type="button">
          <span className="footer-avatar">O</span>
          <span>
            <strong>OpenBot</strong>
            <small>
              <i className={`status-dot ${streamStatus.toLowerCase()}`} /> {streamStatus}
            </small>
          </span>
        </button>
        <div
          aria-label="Resize sidebar"
          className="sidebar-resize-handle"
          onPointerDown={onResize}
          role="separator"
        />
      </aside>

      {searchOpen ? (
        <div className="sidebar-search-overlay" onMouseDown={onSearchClose} role="presentation">
          <section
            aria-label="Search agents"
            aria-modal="true"
            className="sidebar-search-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") onSearchClose();
            }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <label>
              <SearchIcon />
              <input
                aria-label="Search agents"
                autoFocus
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search agents"
                value={searchValue}
              />
            </label>
            <div className="sidebar-search-results">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    onSearchClose();
                    onSelectAgent(agent.id);
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
      ) : null}
    </>
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
