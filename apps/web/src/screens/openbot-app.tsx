import {
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  getMessages,
  getQueuedTurns,
  getSidebar,
  interruptSession,
  observeSession,
  type QueuedTurn,
  reorderQueuedTurn,
  sendMessage,
  type SessionSortOrder,
  steerQueuedTurn,
  uploadAttachment,
} from "../chat-api.js";
import { MessageContent } from "../message-content.js";
import { AgentWorkspacePanel } from "../agent-workspace-panel.js";
import { useWorkspaceLayout } from "../use-workspace-layout.js";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [agentSort] = useState<AgentSortOrder>("updated_at");
  const [sessionSort] = useState<SessionSortOrder>("updated_at");
  const [messageMenuId, setMessageMenuId] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const observerRef = useRef<AbortController | undefined>(undefined);
  const refreshTimerRef = useRef<number | undefined>(undefined);
  const conversationRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const scrollSnapshotsRef = useRef<Record<string, number>>(readScrollSnapshots());
  const restoredSessionRef = useRef("");
  const stickToBottomRef = useRef(true);
  const previousMessageIdRef = useRef("");
  const loadedAgentRef = useRef("");
  const [showScrollLatest, setShowScrollLatest] = useState(false);
  const layout = useWorkspaceLayout();

  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const hasContent = Boolean(draft.trim() || files.length);
  const composerExpanded =
    composerFocused || draft.includes("\n") || draft.length > 80 || files.length > 0;

  useLayoutEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(200, Math.max(44, input.scrollHeight))}px`;
  }, [draft]);

  const refreshSidebar = useCallback(async () => {
    const response = await getSidebar("", agentSort, sessionSort);
    setAgents(response.items);
    setNextAgentToken(response.next_page_token);
    setAgentId((current) =>
      response.items.some((agent) => agent.id === current)
        ? current
        : (response.items[0]?.id ?? ""),
    );
  }, [agentSort, sessionSort]);

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
                void refreshMessages(id, true).catch((reason: unknown) =>
                  setError(errorMessage(reason)),
                );
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
    const timer = window.setTimeout(() => {
      void refreshSidebar()
        .catch((reason: unknown) => setError(errorMessage(reason)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshSidebar]);

  useEffect(() => {
    if (loading || !agentId || loadedAgentRef.current === agentId) return;
    const agent = agents.find((candidate) => candidate.id === agentId);
    const latestSession = agent?.sessions.items[0];
    loadedAgentRef.current = agentId;
    if (latestSession) void selectSession(agentId, latestSession);
  }, [agentId, agents, loading]);

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
    return query
      ? agents.filter((agent) => agent.display_name.toLowerCase().includes(query))
      : agents;
  }, [agents, search]);

  async function selectSession(nextAgentId: string, nextSession: ChatSession): Promise<void> {
    loadedAgentRef.current = nextAgentId;
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

  function selectAgent(agent: ChatAgent): void {
    const latestSession = agent.sessions.items[0];
    if (latestSession) {
      void selectSession(agent.id, latestSession);
      return;
    }
    observerRef.current?.abort();
    loadedAgentRef.current = agent.id;
    setAgentId(agent.id);
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
    const authoredText = draft.trim();
    if (!hasContent || !agentId || submitting) return;
    const text = replyingTo
      ? `> ${messageText(replyingTo).replaceAll("\n", "\n> ")}\n\n${authoredText}`.trim()
      : authoredText;
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
      setReplyingTo(null);
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
      await refreshSidebar();
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

  async function loadOlderMessages(): Promise<void> {
    if (!sessionId || !nextMessageToken) return;
    const response = await getMessages(sessionId, nextMessageToken);
    setMessages((current) => uniqueMessages([...response.items, ...current]));
    setNextMessageToken(response.next_page_token);
  }

  async function loadMoreAgents(): Promise<void> {
    if (!nextAgentToken) return;
    try {
      const response = await getSidebar("", agentSort, sessionSort, nextAgentToken);
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

  function openSearch(): void {
    setSearch("");
    setSearchOpen(true);
  }

  function closeSearch(): void {
    setSearchOpen(false);
    setSearch("");
  }

  return (
    <main
      className={`workspace-shell rich-chat ${layout.sidebarCollapsed ? "sidebar-collapsed" : ""} ${layout.workspaceOpen ? "workspace-open" : "workspace-closed"}`}
      style={layout.style}
    >
      <aside className="rail">
        <div className="sidebar-titlebar" />
        <button
          aria-label="Search"
          className="chat-search"
          onClick={openSearch}
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
              openSearch();
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
          {filteredAgents.map((agent) => (
            <button
              className={agent.id === agentId ? "agent-row active" : "agent-row"}
              key={agent.id}
              onClick={() => selectAgent(agent)}
              title={agent.display_name}
            >
              <AgentAvatar
                agent={agent}
                unread={agent.sessions.items.some((item) => item.unread)}
              />
              <span className="agent-row-body">
                <span className="agent-row-title">
                  <strong>{agent.display_name}</strong>
                  {agent.sessions.items[0] ? (
                    <time dateTime={agent.sessions.items[0].updated_at}>
                      {relativeSessionTime(agent.sessions.items[0].updated_at)}
                    </time>
                  ) : null}
                </span>
                <small>{agent.status || "Ready"}</small>
              </span>
            </button>
          ))}
          {nextAgentToken && !search ? (
            <button className="load-more-agents" onClick={() => void loadMoreAgents()}>
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
          onPointerDown={layout.beginSidebarResize}
          role="separator"
        />
      </aside>

      {searchOpen ? (
        <div className="sidebar-search-overlay" onMouseDown={closeSearch} role="presentation">
          <section
            aria-label="Search agents"
            aria-modal="true"
            className="sidebar-search-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeSearch();
            }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <label>
              <SearchIcon />
              <input
                aria-label="Search agents"
                autoFocus
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search agents"
                value={search}
              />
            </label>
            <div className="sidebar-search-results">
              {filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    closeSearch();
                    selectAgent(agent);
                  }}
                  type="button"
                >
                  <AgentAvatar agent={agent} />
                  <span>
                    <strong>{agent.display_name}</strong>
                    <small>{agent.status || "Ready"}</small>
                  </span>
                </button>
              ))}
              {!loading && filteredAgents.length === 0 ? <p>No agents found</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      <section className="chat-pane">
        <header className="chat-header">
          <div className="chat-identity">
            {selectedAgent ? (
              <AgentAvatar agent={selectedAgent} />
            ) : (
              <span className="agent-avatar">O</span>
            )}
            <div className="chat-title">
              <h2>{selectedAgent?.display_name || "OpenBot"}</h2>
              <span>
                {turnStatus || (streamStatus === "Live" ? "Online" : selectedAgent?.status)}
              </span>
            </div>
          </div>
          <div className="chat-actions">
            <button
              aria-expanded={layout.workspaceOpen}
              aria-label="Toggle Computer pane"
              className={layout.workspaceOpen ? "active" : ""}
              onClick={layout.toggleWorkspace}
              title="Toggle Computer pane (Ctrl+Alt+B)"
            >
              <ComputerIcon />
            </button>
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
              {visibleMessages.map((message, index) => {
                const previous = visibleMessages[index - 1];
                const next = visibleMessages[index + 1];
                const continuedPrevious = previous?.role === message.role;
                const continuedNext = next?.role === message.role;
                return (
                  <article
                    aria-label={message.role === "user" ? "Your message" : "Agent message"}
                    className={`message ${message.role} ${continuedPrevious ? "continued-previous" : "group-start"} ${continuedNext ? "continued-next" : ""}`}
                    key={message.id}
                  >
                    <div className="message-bubble">
                      <MessageContent message={message} />
                    </div>
                    <div className="message-footer">
                      <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                    </div>
                    <div className="message-actions">
                      <button
                        aria-label="Reply"
                        onClick={() => {
                          setReplyingTo(message);
                          composerInputRef.current?.focus();
                        }}
                      >
                        <ReplyIcon />
                      </button>
                      <button
                        aria-label="More message actions"
                        onClick={() => {
                          setMessageMenuId((current) => (current === message.id ? "" : message.id));
                        }}
                      >
                        <MoreIcon />
                      </button>
                      {messageMenuId === message.id ? (
                        <div className="message-menu" role="menu">
                          <button
                            role="menuitem"
                            onClick={() => {
                              setDraft(`Start a thread about: ${messageText(message)}`);
                              setMessageMenuId("");
                              composerInputRef.current?.focus();
                            }}
                          >
                            Start a thread
                          </button>
                          <button
                            role="menuitem"
                            onClick={() => {
                              void navigator.clipboard.writeText(messageText(message));
                              setMessageMenuId("");
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
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
          className={`composer ${dragging ? "dragging" : ""} ${composerExpanded ? "expanded" : ""}`}
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
          {replyingTo ? (
            <div className="reply-preview">
              <ReplyIcon />
              <span>
                <strong>
                  Replying to{" "}
                  {replyingTo.role === "user" ? "yourself" : selectedAgent?.display_name || "agent"}
                </strong>
                <small>{messageText(replyingTo) || "Message"}</small>
              </span>
              <button aria-label="Cancel reply" onClick={() => setReplyingTo(null)} type="button">
                ×
              </button>
            </div>
          ) : null}
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
            ref={composerInputRef}
            placeholder={agentId ? "Ask anything, or drop a file." : "No agent is available."}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setComposerFocused(false)}
            onFocus={() => setComposerFocused(true)}
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
                <PlusIcon />
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
                aria-label={agentBusy ? "Queue message" : "Send message"}
                disabled={!agentId || !hasContent || submitting}
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </form>
      </section>

      <AgentWorkspacePanel
        agentId={agentId}
        agentName={selectedAgent?.display_name || "Agent"}
        activityCount={activity.length}
        open={layout.workspaceOpen}
        onClose={layout.toggleWorkspace}
        onResize={layout.beginWorkspaceResize}
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

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3 3" />
    </svg>
  );
}

function AgentAvatar({ agent, unread = false }: { agent: ChatAgent; unread?: boolean }) {
  const palettes = [
    { surface: "#204f7c", mark: "#159efa" },
    { surface: "#315e45", mark: "#33c276" },
    { surface: "#743927", mark: "#ff6333" },
  ];
  const palette = palettes[stableHue(agent.id) % palettes.length] ?? palettes[0];
  return (
    <span aria-hidden="true" className="avatar">
      <svg viewBox="0 0 40 40">
        <rect width="40" height="40" rx="9.5" fill={palette?.surface} />
        <g fill={palette?.mark}>
          <circle cx="12" cy="8" r="2.1" />
          <circle cx="20" cy="8" r="2.1" />
          <circle cx="28" cy="8" r="2.1" />
          <circle cx="8" cy="12" r="2.1" />
          <rect x="12" y="10" width="8" height="4.2" rx="2.1" />
          <circle cx="24" cy="12" r="2.1" />
          <circle cx="32" cy="12" r="2.1" />
          <circle cx="12" cy="16" r="2.1" />
          <rect x="16" y="14" width="12" height="4.2" rx="2.1" />
          <circle cx="8" cy="20" r="2.1" />
          <circle cx="16" cy="20" r="2.1" />
          <circle cx="24" cy="20" r="2.1" />
          <circle cx="32" cy="20" r="2.1" />
          <rect x="10" y="22" width="12" height="4.2" rx="2.1" />
          <circle cx="28" cy="24" r="2.1" />
          <circle cx="8" cy="28" r="2.1" />
          <circle cx="16" cy="28" r="2.1" />
          <rect x="20" y="26" width="12" height="4.2" rx="2.1" />
          <circle cx="12" cy="32" r="2.1" />
          <circle cx="24" cy="32" r="2.1" />
        </g>
      </svg>
      {unread ? <i /> : null}
    </span>
  );
}

function stableHue(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

function relativeSessionTime(value: string): string {
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

function addSession(agents: ChatAgent[], agentId: string, session: ChatSession): ChatAgent[] {
  return agents.map((agent) =>
    agent.id === agentId
      ? { ...agent, sessions: { ...agent.sessions, items: [session, ...agent.sessions.items] } }
      : agent,
  );
}

function uniqueMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...new Map(messages.map((message) => [message.id, message])).values()].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at),
  );
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

function ComputerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <rect x="2.25" y="2.75" width="11.5" height="8.5" rx="1.5" />
      <path d="M5.25 13.25h5.5M8 11.25v2" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <circle cx="3.25" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="12.75" cy="8" r="1" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m6.75 4-4 4 4 4M3.25 8h5.5c2.25 0 3.75 1.2 4 3.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
    </svg>
  );
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
