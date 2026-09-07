import { useState, useId } from "react";
import type { ParticipantCandidate, SessionParticipant } from "@tryopenbot/client-runtime";
import { DialogSurface } from "./overlay-components.js";
import { ParticipantAvatar } from "./participant-avatars.js";

export interface SessionParticipantsDialogProps {
  open: boolean;
  participants: readonly SessionParticipant[];
  candidates: readonly ParticipantCandidate[];
  currentUserId?: string;
  loading?: boolean;
  searching?: boolean;
  error?: string;
  pendingIds?: readonly string[];
  onSearch: (query: string) => void;
  onClose: () => void;
  onAdd: (candidate: ParticipantCandidate) => void;
  onRemove: (id: string) => void;
}
export function SessionParticipantsDialog({
  open,
  participants,
  candidates,
  currentUserId,
  loading,
  searching,
  error,
  pendingIds = [],
  onSearch,
  onClose,
  onAdd,
  onRemove,
}: SessionParticipantsDialogProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const select = (candidate: ParticipantCandidate) => {
    onAdd(candidate);
    setSearchOpen(false);
    setQuery("");
  };
  return (
    <DialogSurface
      open={open}
      title="Participants"
      description="Manage the people and agents in this chat."
      onClose={onClose}
      actions={
        <button onClick={onClose} type="button">
          Done
        </button>
      }
    >
      <div className="session-participants">
        {error ? (
          <p role="alert" className="session-participants-error">
            {error}
          </p>
        ) : null}
        <div
          className="participant-search"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
          }}
        >
          <label htmlFor={`${listId}-input`}>Add participants</label>
          <input
            id={`${listId}-input`}
            role="combobox"
            aria-label="Search people and agents"
            aria-autocomplete="list"
            aria-expanded={searchOpen}
            aria-controls={listId}
            aria-activedescendant={
              searchOpen && candidates[active] ? `${listId}-${active}` : undefined
            }
            placeholder="Search people and agents"
            value={query}
            onFocus={() => {
              setSearchOpen(true);
              onSearch(query);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setSearchOpen(true);
              onSearch(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchOpen) {
                event.preventDefault();
                event.stopPropagation();
                setSearchOpen(false);
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) =>
                  Math.max(
                    0,
                    Math.min(candidates.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)),
                  ),
                );
              }
              if (event.key === "Enter" && searchOpen) {
                event.preventDefault();
                const candidate = candidates[active];
                if (candidate && !pendingIds.includes(candidate.id)) select(candidate);
              }
            }}
          />
          {searchOpen ? (
            <div
              className="participant-autocomplete"
              id={listId}
              role="listbox"
              aria-label="Existing people and agents"
            >
              {searching ? (
                <p role="status">Searching…</p>
              ) : candidates.length ? (
                candidates.map((candidate, index) => (
                  <button
                    key={`${candidate.kind}:${candidate.id}`}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    disabled={pendingIds.includes(candidate.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(candidate)}
                  >
                    <ParticipantAvatar participant={candidate} />
                    <span>
                      {candidate.name}
                      {candidate.email ? <small>{candidate.email}</small> : null}
                    </span>
                    <span className="participant-add-label">Add</span>
                  </button>
                ))
              ) : (
                <p>No matching people or agents.</p>
              )}
            </div>
          ) : null}
        </div>
        {loading ? <p role="status">Loading participants…</p> : null}
        <ul aria-label="Current participants">
          {participants.map((participant) => (
            <li key={participant.id}>
              <ParticipantAvatar participant={participant} />
              <span>
                {participant.name}
                {currentUserId && participant.userId === currentUserId ? " (you)" : ""}
              </span>
              <button
                type="button"
                disabled={
                  pendingIds.includes(participant.id) ||
                  participant.role === "owner" ||
                  Boolean(currentUserId && participant.userId === currentUserId)
                }
                aria-label={`Remove ${participant.name}`}
                onClick={() => onRemove(participant.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </DialogSurface>
  );
}
