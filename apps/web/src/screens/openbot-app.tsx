import {
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentSortOrder,
  type ChatAgent,
  type ChatEvent,
  type ChatMessage,
  type ChatPart,
  type ChatSession,
  createSession,
  deleteAttachment,
  deleteQueuedTurn,
  getAgentSessions,
  getMessages,
  getQueuedTurns,
  getSidebar,
  interruptSession,
  markSessionUnread,
  observeSession,
  type QueuedTurn,
  renameSession,
  reorderQueuedTurn,
  sendMessage,
  type SessionSortOrder,
  steerQueuedTurn,
  uploadAttachment,
} from "../chat-api.js";
import { MessageContent } from "../message-content.js";
import { AgentWorkspacePanel } from "../agent-workspace-panel.js";

interface PendingFile {
  id: string;
  file: File;
  progress: number;
  status: "ready" | "uploading" | "uploaded" | "error";
  attachmentId?: string;
  error?: string;
}

interface ActivityEvent extends ChatEvent {
  receivedAt: Date;
}

const suggestions = [
  "Inspect this workspace and tell me what to improve first",
  "Build a small feature and verify it end to end",
  "Research a topic, cite sources, and save a concise brief",
];

export function OpenBotApp() {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [nextAgentToken, setNextAgentToken] = useState<string | null>();
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextMessageToken, setNextMessageToken] = useState<string | null>();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [queuedTurns, setQueuedTurns] = useState<QueuedTurn[]>([]);
  const [streamStatus, setStreamStatus] = useState("Disconnected");
  const [turnStatus, setTurnStatus] = useState("");
  const [search, setSearch] = useState("");
  const [agentSort, setAgentSort] = useState<AgentSortOrder>("updated_at");
  const [sessionSort, setSessionSort] = useState<SessionSortOrder>("updated_at");
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const observerRef = useRef<AbortController | undefined>(undefined);
  const refreshTimerRef = useRef<number | undefined>(undefined);
  const conversationRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollSnapshotsRef = useRef<Record<string, number>>(readScrollSnapshots());
  const restoredSessionRef = useRef("");
  const stickToBottomRef = useRef(true);
  const previousMessageIdRef = useRef("");
  const [showScrollLatest, setShowScrollLatest] = useState(false);

  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const selectedSession = selectedAgent?.sessions.items.find((item) => item.id === sessionId);
  const hasContent = Boolean(draft.trim() || files.length);

  const refreshSidebar = useCallback(
    async (query = search) => {
      const response = await getSidebar(query, agentSort, sessionSort);
      setAgents(response.items);
      setNextAgentToken(response.next_page_token);
      setAgentId((current) =>
        response.items.some((agent) => agent.id === current)
          ? current
          : (response.items[0]?.id ?? ""),
      );
    },
    [agentSort, search, sessionSort],
  );

  const refreshMessages = useCallback(async (id: string, preserveLiveMessages = false) => {
    const response = await getMessages(id);
    setMessages((current) =>
      uniqueMessages(preserveLiveMessages ? [...response.items, ...current] : response.items),
    );
    setNextMessageToken(response.next_page_token);
  }, []);

  const refreshQueue = useCallback(async (id: string) => {
    const response = await getQueuedTurns(id);
    setQueuedTurns(
      response.items.sort((left, right) => left.queue_position - right.queue_position),
    );
  }, []);

  const beginObservation = useCallback(
    (id: string) => {
      observerRef.current?.abort();
      const controller = new AbortController();
      observerRef.current = controller;
      setStreamStatus("Connecting");

      void (async () => {
        while (!controller.signal.aborted) {
          try {
            setStreamStatus("Live");
            await observeSession(id, controller.signal, (event) => {
              setActivity((current) =>
                [{ ...event, receivedAt: new Date() }, ...current].slice(0, 60),
              );
              const status = eventStatus(event);
              if (status) setTurnStatus(status);
              const busy = eventBusyState(event);
              if (busy !== undefined) setAgentBusy(busy);
              if (eventName(event).includes("queue")) {
                void refreshQueue(id).catch(() => undefined);
              }
              const streaming = applyLiveChatEvent(event, id, setMessages);
              if (streaming) {
                window.clearTimeout(refreshTimerRef.current);
                return;
              }
              window.clearTimeout(refreshTimerRef.current);
              refreshTimerRef.current = window.setTimeout(() => {
                void refreshMessages(id).catch((reason: unknown) => setError(errorMessage(reason)));
              }, 80);
            });
          } catch (reason) {
            if (controller.signal.aborted) break;
            setStreamStatus("Reconnecting");
            setError(errorMessage(reason));
          }
          await abortableDelay(900, controller.signal);
        }
      })();
    },
    [refreshMessages, refreshQueue],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void refreshSidebar(search)
          .catch((reason: unknown) => setError(errorMessage(reason)))
          .finally(() => setLoading(false));
      },
      search ? 180 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [refreshSidebar, search]);

  useEffect(
    () => () => {
      observerRef.current?.abort();
      window.clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const element = conversationRef.current;
    if (!element || loadingMessages || !sessionId) return;
    const latestMessageId = messages.at(-1)?.id ?? "";
    if (restoredSessionRef.current !== sessionId) {
      const restore = () => {
        const distance = scrollSnapshotsRef.current[sessionId] ?? 0;
        element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - distance);
        stickToBottomRef.current = distance <= 120;
        setShowScrollLatest(distance > 120);
      };
      restore();
      const frame = window.requestAnimationFrame(restore);
      restoredSessionRef.current = sessionId;
      previousMessageIdRef.current = latestMessageId;
      return () => window.cancelAnimationFrame(frame);
    }
    if (
      stickToBottomRef.current &&
      (latestMessageId !== previousMessageIdRef.current || agentBusy || submitting)
    ) {
      element.scrollTo({ top: element.scrollHeight, behavior: agentBusy ? "auto" : "smooth" });
      saveScrollSnapshot(sessionId, 0, scrollSnapshotsRef);
      setShowScrollLatest(false);
    }
    previousMessageIdRef.current = latestMessageId;
  }, [agentBusy, loadingMessages, messages, sessionId, submitting]);

  const queuedMessageIds = useMemo(
    () => new Set(queuedTurns.flatMap((turn) => turn.trigger_message_ids ?? [])),
    [queuedTurns],
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => !queuedMessageIds.has(message.id)),
    [messages, queuedMessageIds],
  );

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return agents;
    return agents
      .map((agent) => ({
        ...agent,
        sessions: {
          ...agent.sessions,
          items: agent.sessions.items.filter((session) =>
            (session.title || "Untitled chat").toLowerCase().includes(query),
          ),
        },
      }))
      .filter(
        (agent) =>
          agent.display_name.toLowerCase().includes(query) || agent.sessions.items.length > 0,
      );
  }, [agents, search]);

  async function selectSession(nextAgentId: string, nextSession: ChatSession): Promise<void> {
    setAgentId(nextAgentId);
    setSessionId(nextSession.id);
    setMessages([]);
    setFiles([]);
    setError("");
    setActivity([]);
    setQueuedTurns([]);
    setTurnStatus("");
    setAgentBusy(false);
    restoredSessionRef.current = "";
    setLoadingMessages(true);
    beginObservation(nextSession.id);
    try {
      await refreshMessages(nextSession.id, true);
      await refreshQueue(nextSession.id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoadingMessages(false);
    }
  }

  function startNewChat(nextAgentId = agentId): void {
    observerRef.current?.abort();
    setAgentId(nextAgentId);
    setSessionId("");
    setMessages([]);
    setFiles([]);
    setActivity([]);
    setQueuedTurns([]);
    setTurnStatus("");
    setAgentBusy(false);
    restoredSessionRef.current = "";
    setStreamStatus("Disconnected");
    setError("");
  }

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    const text = draft.trim();
    if (!hasContent || !agentId || submitting) return;
    const queueing = agentBusy;
    const outgoingFiles = files;
    setSubmitting(true);
    setError("");
    setTurnStatus(queueing ? "Adding to queue" : "Starting turn");
    let activeSessionId = sessionId;
    try {
      if (!activeSessionId) {
        const created = await createSession(agentId, titleFrom(text, outgoingFiles));
        activeSessionId = created.id;
        setSessionId(created.id);
        setAgents((current) => addSession(current, agentId, created));
        beginObservation(created.id);
      }

      if (!queueing) {
        const optimistic = optimisticMessage(activeSessionId, text, outgoingFiles);
        setMessages((current) => [...current, optimistic]);
      }
      setDraft("");
      setFiles([]);

      const attachmentIds: string[] = [];
      for (const pending of outgoingFiles) {
        setFiles((current) => [...current, { ...pending, status: "uploading", progress: 0 }]);
        try {
          const attachment = await uploadAttachment(activeSessionId, pending.file, (progress) =>
            setFileState(pending.id, { progress }),
          );
          attachmentIds.push(attachment.id);
          setFileState(pending.id, {
            status: "uploaded",
            progress: 1,
            attachmentId: attachment.id,
          });
        } catch (reason) {
          setFileState(pending.id, { status: "error", error: errorMessage(reason) });
          throw reason;
        }
      }

      const response = await sendMessage(agentId, activeSessionId, text, attachmentIds);
      if (!queueing) {
        setMessages(uniqueMessages(response.items));
        setNextMessageToken(response.next_page_token);
        setAgentBusy(true);
      }
      setFiles([]);
      setTurnStatus(queueing ? "Queued" : "Agent working");
      await refreshSidebar(search);
      await refreshQueue(activeSessionId);
    } catch (reason) {
      setError(errorMessage(reason));
      setTurnStatus("Turn failed");
      if (activeSessionId) await refreshMessages(activeSessionId).catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function stop(): Promise<void> {
    if (!sessionId) return;
    try {
      await interruptSession(sessionId);
      setTurnStatus("Interrupted");
      setAgentBusy(false);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  function addFiles(incoming: FileList | File[]): void {
    const additions = [...incoming].map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: "ready" as const,
    }));
    setFiles((current) => [...current, ...additions].slice(0, 10));
  }

  function setFileState(id: string, patch: Partial<PendingFile>): void {
    setFiles((current) => current.map((file) => (file.id === id ? { ...file, ...patch } : file)));
  }

  async function removeFile(pending: PendingFile): Promise<void> {
    if (pending.attachmentId && sessionId) {
      await deleteAttachment(sessionId, pending.attachmentId).catch(() => undefined);
    }
    setFiles((current) => current.filter((file) => file.id !== pending.id));
  }

  async function saveTitle(event: FormEvent): Promise<void> {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!sessionId || !title) return;
    try {
      const updated = await renameSession(sessionId, title);
      setAgents((current) => updateSession(current, sessionId, updated));
      setRenaming(false);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function loadOlderMessages(): Promise<void> {
    if (!sessionId || !nextMessageToken) return;
    const response = await getMessages(sessionId, nextMessageToken);
    setMessages((current) => uniqueMessages([...response.items, ...current]));
    setNextMessageToken(response.next_page_token);
  }

  async function loadMoreSessions(agent: ChatAgent): Promise<void> {
    if (!agent.sessions.next_page_token) return;
    const response = await getAgentSessions(agent.id, agent.sessions.next_page_token, sessionSort);
    setAgents((current) =>
      current.map((candidate) =>
        candidate.id === agent.id
          ? {
              ...candidate,
              sessions: {
                items: uniqueSessions([...candidate.sessions.items, ...response.items]),
                next_page_token: response.next_page_token,
              },
            }
          : candidate,
      ),
    );
  }

  async function loadMoreAgents(): Promise<void> {
    if (!nextAgentToken) return;
    try {
      const response = await getSidebar(search, agentSort, sessionSort, nextAgentToken);
      setAgents((current) => uniqueAgents([...current, ...response.items]));
      setNextAgentToken(response.next_page_token);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function mutateQueue(operation: () => Promise<void>): Promise<void> {
    if (!sessionId) return;
    try {
      await operation();
      await refreshQueue(sessionId);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function editQueuedTurn(turn: QueuedTurn): Promise<void> {
    const text = queuedTurnText(turn);
    await mutateQueue(() => deleteQueuedTurn(turn.id));
    setDraft(text === "Queued agent turn" ? "" : text);
  }

  function handleConversationScroll(): void {
    const element = conversationRef.current;
    if (!element || !sessionId) return;
    const distance = Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop);
    stickToBottomRef.current = distance <= 120;
    setShowScrollLatest(distance > 120);
    saveScrollSnapshot(sessionId, distance, scrollSnapshotsRef);
  }

  function scrollToLatest(): void {
    const element = conversationRef.current;
    if (!element || !sessionId) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    stickToBottomRef.current = true;
    setShowScrollLatest(false);
    saveScrollSnapshot(sessionId, 0, scrollSnapshotsRef);
  }

  return (
    <main className="workspace-shell rich-chat">
      <aside className="rail">
        <div className="brand">
          <span>✣</span>
          <strong>OpenBot</strong>
        </div>
        <button className="new-chat" disabled={!agentId} onClick={() => startNewChat()}>
          <span>+</span> New chat
        </button>
        <label className="chat-search">
          <span>⌕</span>
          <input
            aria-label="Search conversations"
            placeholder="Search chats"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="chat-sorters">
          <label>
            Agents
            <select
              aria-label="Sort agents"
              value={agentSort}
              onChange={(event) => setAgentSort(event.target.value as AgentSortOrder)}
            >
              <option value="updated_at">Recent</option>
              <option value="created_at">Created</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label>
            Chats
            <select
              aria-label="Sort chats"
              value={sessionSort}
              onChange={(event) => setSessionSort(event.target.value as SessionSortOrder)}
            >
              <option value="updated_at">Recent</option>
              <option value="created_at">Created</option>
            </select>
          </label>
        </div>
        <nav className="agent-navigation">
          <p>Agents</p>
          {loading ? <p className="agent-status">Loading agents…</p> : null}
          {!loading && agents.length === 0 ? (
            <p className="agent-status">No agents are available.</p>
          ) : null}
          {filteredAgents.map((agent) => (
            <div className="agent-group" key={agent.id}>
              <button
                className={agent.id === agentId ? "agent-row active" : "agent-row"}
                onClick={() => startNewChat(agent.id)}
              >
                <span className="avatar">{agent.display_name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{agent.display_name}</strong>
                  <small>{agent.status}</small>
                </span>
              </button>
              <div className="session-list">
                {agent.sessions.items.map((item) => (
                  <button
                    className={item.id === sessionId ? "active" : ""}
                    key={item.id}
                    onClick={() => void selectSession(agent.id, item)}
                    title={item.title || "Untitled chat"}
                  >
                    {item.unread ? <i /> : null}
                    {item.title || "Untitled chat"}
                  </button>
                ))}
                {agent.sessions.next_page_token ? (
                  <button className="load-more" onClick={() => void loadMoreSessions(agent)}>
                    Show more
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {nextAgentToken && !search ? (
            <button className="load-more-agents" onClick={() => void loadMoreAgents()}>
              Show more agents
            </button>
          ) : null}
        </nav>
        <div className="rail-footer">
          <span className={`status-dot ${streamStatus.toLowerCase()}`} /> {streamStatus}
        </div>
      </aside>

      <section className="chat-pane">
        <header>
          <div className="chat-title">
            <p className="eyebrow">{selectedAgent?.status || "Agent workspace"}</p>
            {renaming ? (
              <form onSubmit={(event) => void saveTitle(event)}>
                <input
                  aria-label="Conversation title"
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => setRenaming(false)}
                />
              </form>
            ) : (
              <h2>{selectedSession?.title || selectedAgent?.display_name || "OpenBot"}</h2>
            )}
          </div>
          <div className="chat-actions">
            {turnStatus ? <span>{turnStatus}</span> : null}
            {sessionId ? (
              <>
                <button
                  title="Rename chat"
                  onClick={() => {
                    setTitleDraft(selectedSession?.title || "");
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
                <button
                  title="Mark unread"
                  onClick={() =>
                    void markSessionUnread(sessionId)
                      .then((updated) =>
                        setAgents((current) => updateSession(current, sessionId, updated)),
                      )
                      .catch((reason: unknown) => setError(errorMessage(reason)))
                  }
                >
                  Unread
                </button>
              </>
            ) : null}
          </div>
        </header>

        <div
          className="conversation"
          aria-live="polite"
          ref={conversationRef}
          onScroll={handleConversationScroll}
        >
          {loadingMessages ? (
            <div className="conversation-loading">Loading conversation…</div>
          ) : null}
          {!loadingMessages && messages.length === 0 ? (
            <div className="empty-chat">
              <div className="openbot-glyph">✣</div>
              <h1>What should OpenBot do?</h1>
              <p>Message an agent. It can use tools, skills, files, and its Computer.</p>
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => setDraft(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {nextMessageToken ? (
                <button className="older-messages" onClick={() => void loadOlderMessages()}>
                  Load earlier messages
                </button>
              ) : null}
              {visibleMessages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="message-meta">
                    <span>
                      {message.role === "user"
                        ? "You"
                        : message.user_display_name || selectedAgent?.display_name || message.role}
                    </span>
                    <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                    <button
                      aria-label="Copy message"
                      onClick={() => void navigator.clipboard.writeText(messageText(message))}
                    >
                      Copy
                    </button>
                  </div>
                  <MessageContent message={message} />
                </article>
              ))}
              {agentBusy ? (
                <div className="thinking-inline">
                  <span /> {turnStatus || `${selectedAgent?.display_name || "Agent"} is working…`}
                </div>
              ) : null}
            </div>
          )}
        </div>
        {showScrollLatest ? (
          <button className="scroll-latest" onClick={scrollToLatest} aria-label="Scroll to latest">
            ↓
          </button>
        ) : null}

        <form
          className={`composer ${dragging ? "dragging" : ""}`}
          onSubmit={(event) => void send(event)}
          onDragEnter={(event) => dragState(event, true)}
          onDragOver={(event) => dragState(event, true)}
          onDragLeave={(event) => dragState(event, false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          {files.length ? (
            <div className="attachment-tray">
              {files.map((pending) => (
                <div className={`pending-file ${pending.status}`} key={pending.id}>
                  <span className="file-icon">↗</span>
                  <span>
                    <strong>{pending.file.name}</strong>
                    <small>
                      {pending.status === "uploading"
                        ? `${Math.round(pending.progress * 100)}%`
                        : pending.error || formatBytes(pending.file.size)}
                    </small>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeFile(pending)}
                    aria-label="Remove file"
                  >
                    ×
                  </button>
                  {pending.status === "uploading" ? (
                    <i style={{ width: `${pending.progress * 100}%` }} />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {dragging ? <div className="drop-overlay">Drop files to attach</div> : null}
          <textarea
            aria-label="Message"
            disabled={!agentId}
            placeholder={agentId ? "Message your agent…" : "No agent is available."}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="composer-toolbar">
            <div>
              <input
                hidden
                multiple
                ref={fileInputRef}
                type="file"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                className="attach-button"
                type="button"
                disabled={!agentId || submitting}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
                title="Attach files"
              >
                +
              </button>
              <span className={error ? "error" : ""}>
                {error || "Shift + Enter for a new line"}
              </span>
            </div>
            <div className="composer-actions">
              {agentBusy ? (
                <button
                  className="stop-button"
                  type="button"
                  onClick={() => void stop()}
                  aria-label="Stop"
                >
                  ■
                </button>
              ) : null}
              <button
                aria-label={agentBusy ? "Queue message" : "Send"}
                disabled={!agentId || !hasContent || submitting}
              >
                ↑
              </button>
            </div>
          </div>
        </form>
      </section>

      <AgentWorkspacePanel
        agentId={agentId}
        agentName={selectedAgent?.display_name || "Agent"}
        activityCount={activity.length}
        activity={
          <>
            {queuedTurns.length ? (
              <section className="queue-panel">
                <header>
                  <strong>Queued turns</strong>
                  <span>{queuedTurns.length}</span>
                </header>
                {queuedTurns.map((turn, index) => (
                  <article key={turn.id}>
                    <span>{index + 1}</span>
                    <p>{queuedTurnText(turn)}</p>
                    <div>
                      <button
                        disabled={index === 0}
                        onClick={() =>
                          void mutateQueue(() =>
                            reorderQueuedTurn(turn.id, turn.queue_position - 1),
                          )
                        }
                        title="Move earlier"
                      >
                        ↑
                      </button>
                      <button
                        disabled={index === queuedTurns.length - 1}
                        onClick={() =>
                          void mutateQueue(() =>
                            reorderQueuedTurn(turn.id, turn.queue_position + 1),
                          )
                        }
                        title="Move later"
                      >
                        ↓
                      </button>
                      <button onClick={() => void mutateQueue(() => steerQueuedTurn(turn.id))}>
                        Run now
                      </button>
                      <button onClick={() => void editQueuedTurn(turn)}>Edit</button>
                      <button onClick={() => void mutateQueue(() => deleteQueuedTurn(turn.id))}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            ) : null}
            {activity.length === 0 ? (
              <div className="activity-empty">
                <span>⌁</span>
                <h3>Agent activity</h3>
                <p>Tool calls, turn status, child agents, and streaming events appear here.</p>
              </div>
            ) : (
              <ol className="event-list">
                {activity.map((event, index) => (
                  <li key={`${event.id || event.receivedAt.valueOf()}-${index}`}>
                    <span className="event-dot" />
                    <div>
                      <strong>{humanEventName(event.type)}</strong>
                      <time>
                        {event.receivedAt.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                      <EventSummary value={event.data} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        }
      />
    </main>
  );

  function dragState(event: DragEvent, active: boolean): void {
    event.preventDefault();
    setDragging(active);
  }
}

function EventSummary({ value }: { value: unknown }) {
  const summary = eventSummary(value);
  return summary ? <p>{summary}</p> : null;
}

function addSession(agents: ChatAgent[], agentId: string, session: ChatSession): ChatAgent[] {
  return agents.map((agent) =>
    agent.id === agentId
      ? { ...agent, sessions: { ...agent.sessions, items: [session, ...agent.sessions.items] } }
      : agent,
  );
}

function updateSession(agents: ChatAgent[], sessionId: string, updated: ChatSession): ChatAgent[] {
  return agents.map((agent) => ({
    ...agent,
    sessions: {
      ...agent.sessions,
      items: agent.sessions.items.map((session) =>
        session.id === sessionId ? { ...session, ...updated } : session,
      ),
    },
  }));
}

function uniqueMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...new Map(messages.map((message) => [message.id, message])).values()].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
  );
}

function uniqueSessions(sessions: ChatSession[]): ChatSession[] {
  return [...new Map(sessions.map((session) => [session.id, session])).values()];
}

function uniqueAgents(agents: ChatAgent[]): ChatAgent[] {
  return [...new Map(agents.map((agent) => [agent.id, agent])).values()];
}

const SCROLL_STORAGE_KEY = "openbot:chat-scroll";

function readScrollSnapshots(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCROLL_STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveScrollSnapshot(
  sessionId: string,
  distanceFromBottom: number,
  snapshotsRef: { current: Record<string, number> },
): void {
  snapshotsRef.current = { ...snapshotsRef.current, [sessionId]: distanceFromBottom };
  const recent = Object.fromEntries(Object.entries(snapshotsRef.current).slice(-50));
  localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(recent));
}

function optimisticMessage(sessionId: string, text: string, files: PendingFile[]): ChatMessage {
  const parts = [
    ...(text ? [{ type: "text", text }] : []),
    ...files.map(({ file }) => ({
      type: "file",
      filename: file.name,
      media_type: file.type || "application/octet-stream",
      url: URL.createObjectURL(file),
    })),
  ];
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    type: "ui",
    role: "user",
    session_id: sessionId,
    user_display_name: "You",
    parts,
    created_at: new Date().toISOString(),
  };
}

function titleFrom(text: string, files: PendingFile[]): string {
  const value = text || files[0]?.file.name || "New chat";
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function eventStatus(event: ChatEvent): string {
  const kind = eventName(event);
  const data = record(event.data);
  if (kind.includes("turn") || kind.includes("status")) {
    const status = stringValue(data.status) || stringValue(record(data.payload).status);
    return status ? humanEventName(status) : humanEventName(event.type);
  }
  if (kind.includes("streaming")) return "Streaming response";
  if (kind.includes("queued")) return "Queued";
  if (kind.includes("message_created")) return "Message received";
  return "";
}

function eventBusyState(event: ChatEvent): boolean | undefined {
  const kind = eventName(event);
  const data = record(event.data);
  const deltaType = findField(data, "type").toLowerCase();
  if (["finish", "abort", "error"].includes(deltaType)) return false;

  const status = (
    firstString(data, "status") ||
    firstString(record(data.payload), "status") ||
    firstString(record(data.kind), "status")
  ).toLowerCase();
  if (
    /^(idle|complete|completed|finished|failed|error|aborted|cancelled|canceled|interrupted)$/.test(
      status,
    )
  ) {
    return false;
  }
  if (/^(busy|working|running|streaming|queued|pending|starting|in_progress)$/.test(status)) {
    return true;
  }
  if (kind.includes("message.streaming") || kind.includes("turn.started")) return true;
  if (kind.includes("turn.completed") || kind.includes("turn.failed")) return false;
  return undefined;
}

function eventName(event: ChatEvent): string {
  const nestedKind = record(record(event.data).kind);
  const named = firstString(nestedKind, "kind") || Object.keys(nestedKind)[0] || event.type;
  return named.toLowerCase().replaceAll("_", ".");
}

function applyLiveChatEvent(
  event: ChatEvent,
  activeSessionId: string,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
): boolean {
  const kind = event.type.toLowerCase();
  const payload =
    eventKindPayload(event.data, "message_streaming") ??
    eventKindPayload(event.data, "MessageStreaming") ??
    (kind.includes("message_streaming") || kind.includes("message.streaming")
      ? record(event.data)
      : undefined);
  if (payload) {
    const sessionId = firstString(payload, "session_id", "sessionId") || activeSessionId;
    const messageId = firstString(payload, "message_id", "messageId");
    if (sessionId !== activeSessionId || !messageId) return true;
    const deltaKind = findField(payload.delta ?? payload, "type");
    if (deltaKind === "finish" || deltaKind === "abort") return false;
    if (deltaKind === "error") {
      const text =
        findField(payload.delta ?? payload, "errorText", "error_text", "error", "message") ||
        "The agent failed to respond.";
      setMessages((current) =>
        upsertMessage(current, {
          id: `agent-stream-error:${messageId}`,
          type: "text",
          role: "assistant",
          session_id: sessionId,
          user_display_name: "Agent",
          text,
          created_at: new Date().toISOString(),
        }),
      );
      return false;
    }
    const textDelta = findTextDelta(payload);
    const toolPart = findToolPart(payload);
    if (!textDelta && !toolPart) return true;
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === messageId);
      if (index < 0) {
        return [
          ...current,
          {
            id: messageId,
            type: "ui",
            role: "assistant",
            session_id: sessionId,
            user_display_name: "Agent",
            parts: [
              ...(textDelta ? [{ type: "text", text: textDelta }] : []),
              ...(toolPart ? [toolPart] : []),
            ],
            created_at: new Date().toISOString(),
          },
        ];
      }
      return current.map((message, messageIndex) =>
        messageIndex === index
          ? {
              ...message,
              type: "ui",
              parts: mergeStreamingParts(message.parts ?? [], textDelta, toolPart),
              updated_at: new Date().toISOString(),
            }
          : message,
      );
    });
    return true;
  }

  const createdPayload =
    eventKindPayload(event.data, "message_created") ??
    eventKindPayload(event.data, "MessageCreated") ??
    (kind.includes("message_created") || kind.includes("message.created")
      ? record(event.data)
      : undefined);
  const created = record(createdPayload?.message ?? createdPayload);
  if (created.id && created.session_id === activeSessionId) {
    setMessages((current) => upsertMessage(current, created as unknown as ChatMessage));
  }
  return false;
}

function mergeStreamingParts(
  parts: ChatPart[],
  textDelta: string,
  toolPart: ChatPart | undefined,
): ChatPart[] {
  let next = parts;
  if (textDelta) {
    const lastTextIndex = next.findLastIndex((part) => part.type === "text");
    next =
      lastTextIndex < 0
        ? [...next, { type: "text", text: textDelta }]
        : next.map((part, index) =>
            index === lastTextIndex ? { ...part, text: `${part.text ?? ""}${textDelta}` } : part,
          );
  }
  if (toolPart) {
    const toolIndex = next.findIndex(
      (part) => part.type === "tool" && part.tool_invocation_id === toolPart.tool_invocation_id,
    );
    next =
      toolIndex < 0
        ? [...next, toolPart]
        : next.map((part, index) => (index === toolIndex ? { ...part, ...toolPart } : part));
  }
  return next;
}

function upsertMessage(current: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const withoutOptimistic = current.filter(
    (candidate) =>
      !(
        candidate.id.startsWith("optimistic-") &&
        candidate.role === message.role &&
        messageText(candidate) === messageText(message)
      ),
  );
  const index = withoutOptimistic.findIndex((candidate) => candidate.id === message.id);
  if (index < 0) return uniqueMessages([...withoutOptimistic, message]);
  return withoutOptimistic.map((candidate, candidateIndex) =>
    candidateIndex === index ? message : candidate,
  );
}

function eventKindPayload(value: unknown, key: string): Record<string, unknown> | undefined {
  const event = record(value);
  const kind = record(event.kind);
  if (kind.kind === key) return kind;
  const payload = kind[key];
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : undefined;
}

function findTextDelta(value: unknown, depth = 0): string {
  if (depth > 6) return "";
  const item = record(value);
  const type = firstString(item, "type", "delta_type", "deltaType");
  if (
    (type === "text-delta" || type === "text_delta" || type === "text") &&
    typeof item.delta === "string"
  ) {
    return item.delta;
  }
  if ((type === "text-delta" || type === "text_delta") && typeof item.text === "string") {
    return item.text;
  }
  for (const key of ["delta", "ui", "Ui", "text", "Text", "value", "payload"]) {
    if (typeof item[key] === "object" && item[key] !== null) {
      const found = findTextDelta(item[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function findToolPart(value: unknown, depth = 0): ChatPart | undefined {
  if (depth > 6) return undefined;
  const item = record(value);
  const type = firstString(item, "type");
  if (type === "dynamic-tool" || type.startsWith("tool-")) {
    const toolName =
      firstString(item, "toolName", "tool_name") ||
      (type.startsWith("tool-") ? type.slice("tool-".length) : "tool");
    const toolInvocationId = firstString(item, "toolCallId", "tool_call_id", "id") || toolName;
    return {
      type: "tool",
      tool_name: toolName,
      tool_invocation_id: toolInvocationId,
      state: toolState(type, firstString(item, "state")),
      input: item.input,
      output: item.output,
      error_text: firstString(item, "errorText", "error_text", "error", "message") || undefined,
    };
  }
  for (const key of ["delta", "ui", "Ui", "value", "payload", "part"]) {
    if (typeof item[key] === "object" && item[key] !== null) {
      const found = findToolPart(item[key], depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function toolState(type: string, explicit: string): string {
  if (explicit) return explicit;
  switch (type) {
    case "tool-input-start":
    case "tool-input-delta":
      return "input-streaming";
    case "tool-input-available":
      return "input-available";
    case "tool-output-available":
      return "output-available";
    case "tool-output-error":
      return "output-error";
    default:
      return "input-available";
  }
}

function findField(value: unknown, ...keys: string[]): string {
  const item = record(value);
  const direct = firstString(item, ...keys);
  if (direct) return direct;
  for (const key of ["delta", "ui", "Ui", "value", "payload"]) {
    if (typeof item[key] === "object" && item[key] !== null) {
      const found = findField(item[key], ...keys);
      if (found) return found;
    }
  }
  return "";
}

function firstString(value: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key];
  }
  return "";
}

function eventSummary(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 180);
  const data = record(value);
  for (const key of ["summary", "message", "text", "status", "tool_name", "agent_name"]) {
    const found = stringValue(data[key]);
    if (found) return found.slice(0, 180);
  }
  return "";
}

function queuedTurnText(turn: QueuedTurn): string {
  const messages = turn.chat_request.messages;
  if (!Array.isArray(messages)) return "Queued agent turn";
  const latest = messages.filter((message) => record(message).role === "user").at(-1);
  return unknownText(record(latest).content ?? record(latest).parts) || "Queued agent turn";
}

function unknownText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(unknownText).filter(Boolean).join("\n");
  if (typeof value !== "object" || value === null) return "";
  const item = record(value);
  if (typeof item.text === "string") return item.text;
  const nested = item.content ?? item.parts;
  return nested === undefined ? "" : unknownText(nested);
}

function messageText(message: ChatMessage): string {
  if (message.text) return message.text;
  return (message.parts ?? []).map((part) => part.text || "").join("");
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function humanEventName(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "OpenBot request failed";
}

async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
