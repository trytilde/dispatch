import { type FormEvent, useEffect, useCallback, useMemo, useRef, useState } from "react";
import {
  type ChatAgent,
  type ConnectorSetupRequest,
  connectorAuthorizedReturnUrl,
  isChatFindShortcut,
  projectChatTranscript,
  layoutChatTranscript,
  promptStatus,
  queuedTurnText,
  userSessionForAgent,
  errorMessage,
  createChatConnectorRuntime,
  latestMessagePreview,
  messageText,
  type QueuedTurn,
  agentConversationSessions,
} from "@tryopenbot/client-runtime";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useStore } from "zustand";
import {
  AddAgentDialog,
  AgentSetupDialog,
  AgentWorkspacePanel,
  ChatPrompt,
  TranscriptTimeSeparator,
  ChatMessage as ChatMessageView,
  useChatFindHighlight,
  ChatEventSurface,
  SessionParticipantsDialog,
  ChatHeader,
  ChatPane,
  type ConnectorPartActions,
  type ConnectorSelectionView,
  ChatConnectorDialog,
  ConversationSkeleton,
  ConversationSurface,
  MessageContent,
  ThinkingIndicator,
  WorkspaceSidebar,
  type WorkspaceSearchResult,
  WorkspaceShell,
  useWorkspaceLayout,
} from "@tryopenbot/ui";
import type { WorkspaceSearch } from "../router.js";
import { AgentDetailsContainer } from "./agent-details.js";
import { openBotRuntime, registerPromptFiles } from "../runtime.js";
import { useClientWorkspace } from "../workspaces.js";
import { shouldExpandComposer } from "./composer-layout.js";
import { rankWorkspaceSearchHits, searchHitId } from "./search-results.js";

export function OpenBotApp() {
  useEffect(() => {
    void openBotRuntime.actions.initialize({ workspace: true });
  }, []);

  const auth = useStore(openBotRuntime.store, (state) => state.auth);
  const sidebar = useStore(openBotRuntime.store, (state) => state.sidebar);
  const conversation = useStore(openBotRuntime.store, (state) => state.conversation);
  const agentSetup = useStore(openBotRuntime.store, (state) => state.agentSetup);
  const chatSearch = useStore(openBotRuntime.store, (state) => state.search);
  const sessionHeader = useStore(openBotRuntime.session.store);
  const { agents, nextAgentToken, selectedAgentId: agentId, loading } = sidebar;
  const {
    selectedSessionId: sessionId,
    messages,
    nextMessageToken,
    queuedTurns,
    participantEvents,
    loading: loadingMessages,
    submitting,
    agentBusy,
    turnStatus,
    error,
  } = conversation;
  const promptState = useStore(openBotRuntime.prompt.store);
  const draft = promptState.draft;
  const setDraft = openBotRuntime.prompt.setDraft;
  const files = promptState.attachments;
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Modal open-state lives in the URL so redirects and deep links can target
  // it directly; see WorkspaceSearch in router.tsx.
  const workspaceSearch = useSearch({ strict: false }) as WorkspaceSearch;
  const createAgentOpen = workspaceSearch.dialog === "new-agent";
  const chatConnectors = useMemo(
    () =>
      createChatConnectorRuntime(openBotRuntime.client, {
        openAuthorization: (url) => {
          window.open(url, "_blank", "noopener");
        },
        returnUrl: () =>
          connectorAuthorizedReturnUrl(
            window.location.origin,
            navigator.userAgent.includes("Electron") ? "electron" : "web",
          ),
        saveSecretOutputs: (outputs) => {
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(outputs, null, 2)], { type: "application/json" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "provider-credentials.json";
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        onSetupComplete: async (request) => {
          setConnectorRoute(undefined);
          await openBotRuntime.actions.sendMessage({
            text: `Credential setup completed for ${request.provider_name}. tool_group_instance_id=${request.resource_id}${request.target ? `; target_mcp_server_instance_id=${request.target.mcp_server_instance_id}; target_kind=${request.target.kind}` : ""}. Verify the account and finish enabling only the required functions on the chosen target, then continue the task.`,
          });
        },
        onComplete: async (accountId, mcpServerId) => {
          setConnectorRoute(undefined);
          await openBotRuntime.actions.sendMessage({
            text: `Connector enabled for my tools. tool_group_instance_id=${accountId}; mcp_server_instance_id=${mcpServerId}. Continue the original task using this user tools MCP, not your agent-owned MCP.`,
          });
        },
      }),
    [],
  );
  const connectorState = useStore(chatConnectors.store);
  const connectorSetupState = useStore(chatConnectors.setup.store);
  useEffect(() => () => chatConnectors.dispose(), [chatConnectors]);
  useEffect(() => {
    chatConnectors.close();
  }, [chatConnectors, sessionId, auth.session?.user.subject]);
  const pendingConnectorRequestRef = useRef<ConnectorSetupRequest | null>(null);
  const pendingConnectorSelectionRef = useRef<ConnectorSelectionView | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLElement>(null);
  const scrollSnapshotsRef = useRef<Record<string, number>>(readScrollSnapshots());
  const restoredSessionRef = useRef("");
  const stickToBottomRef = useRef(true);
  const previousMessageIdRef = useRef("");
  const [showScrollLatest, setShowScrollLatest] = useState(false);
  const layout = useWorkspaceLayout({ floatingWorkspace: true });
  const navigate = useNavigate();
  const setCreateAgentOpen = (open: boolean): void => {
    void navigate({
      to: "/",
      search: (current: WorkspaceSearch) => ({
        ...current,
        dialog: open ? ("new-agent" as const) : undefined,
      }),
      replace: !open,
    });
  };
  const setConnectorRoute = (providerTypeId: string | undefined): void => {
    void navigate({
      to: "/",
      search: (current: WorkspaceSearch) => ({ ...current, connector: providerTypeId }),
      replace: !providerTypeId,
    });
  };
  // The details pane and its drill-in routine live in the URL too, so deep
  // links can open a routine directly (`?details=work&routine=<id|new>`).
  const detailsOpen = workspaceSearch.details === "work";
  const routineParam = workspaceSearch.routine;
  const setDetailsRoute = (open: boolean, routine?: string): void => {
    void navigate({
      to: "/",
      search: (current: WorkspaceSearch) => ({
        ...current,
        details: open ? ("work" as const) : undefined,
        routine: open ? routine : undefined,
      }),
      replace: !open,
    });
  };
  const clientWorkspace = useClientWorkspace();

  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const composerExpanded = shouldExpandComposer(draft, files.length > 0);

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

  const sidebarChats = useMemo(() => {
    const chats = agents.flatMap((agent) => {
      const userId = auth.session?.user.subject ?? "";
      const { userSession, threads } = agentConversationSessions(agent, userId);
      const row = (
        session: (typeof agent.sessions.items)[number] | undefined,
        badge: "bot" | "thread",
      ) => {
        const selected = agent.id === agentId && session?.id === sessionId;
        const cachedPreview =
          badge === "bot" && session?.id === agent.sessions.items[0]?.id
            ? agent.last_message_preview || ""
            : "";
        return {
          id: session ? `session:${session.id}` : `user:${agent.id}`,
          avatarId: agent.id,
          badge,
          name: badge === "bot" ? agent.display_name : session?.title?.trim() || "Untitled thread",
          lastMessage:
            selected || (agent.id === agentId && !session && !sessionId)
              ? latestMessagePreview(messages) || cachedPreview
              : cachedPreview,
          updatedAt: session?.last_user_message_at || session?.updated_at,
          unread: session?.unread,
          busy: session ? sidebar.busySessionIds.includes(session.id) : false,
        };
      };
      return [row(userSession, "bot"), ...threads.map((session) => row(session, "thread"))];
    });
    const query = search.trim().toLowerCase();
    return query
      ? chats.filter((chat) => `${chat.name} ${chat.badge}`.toLowerCase().includes(query))
      : chats;
  }, [
    agentId,
    agents,
    auth.session?.user.subject,
    messages,
    search,
    sessionId,
    sidebar.busySessionIds,
  ]);

  const selectedSidebarChatId = sessionId ? `session:${sessionId}` : `user:${agentId}`;

  function selectSidebarChat(chatId: string): void {
    if (chatId.startsWith("user:")) {
      const agent = agents.find((candidate) => `user:${candidate.id}` === chatId);
      if (agent) selectAgent(agent);
      return;
    }
    if (!chatId.startsWith("session:")) return;
    const selectedSessionId = chatId.slice("session:".length);
    for (const agent of agents) {
      const session = agent.sessions.items.find((candidate) => candidate.id === selectedSessionId);
      if (!session) continue;
      clearFiles();
      restoredSessionRef.current = "";
      void openBotRuntime.actions.selectSession(agent.id, session);
      return;
    }
  }

  useEffect(() => {
    if (!searchOpen || !search.trim()) {
      openBotRuntime.actions.clearSearch();
      return;
    }
    const handle = window.setTimeout(() => void openBotRuntime.actions.searchChatKit(search), 250);
    return () => window.clearTimeout(handle);
  }, [search, searchOpen]);

  const rankedSearchHits = useMemo(
    () => rankWorkspaceSearchHits(chatSearch.items, search),
    [chatSearch.items, search],
  );
  const searchHitsById = useMemo(
    () => new Map(rankedSearchHits.map((hit) => [searchHitId(hit), hit])),
    [rankedSearchHits],
  );
  const searchResults = useMemo<WorkspaceSearchResult[]>(
    () =>
      rankedSearchHits.map((hit) => ({
        id: searchHitId(hit),
        kind: hit.kind === "agent" ? "agent" : hit.kind,
        title:
          hit.kind === "agent"
            ? hit.agent?.display_name || hit.agent?.id || "Bot"
            : hit.session.title || "Untitled conversation",
        subtitle:
          hit.kind === "message"
            ? (hit.message ? messageText(hit.message).trim() : "") || "Matching message"
            : hit.kind === "session_title"
              ? "Conversation title"
              : hit.agent?.id,
      })),
    [rankedSearchHits],
  );

  function selectAgent(agent: ChatAgent): void {
    clearFiles();
    restoredSessionRef.current = "";
    void openBotRuntime.actions.selectAgent(agent.id);
  }

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!agentId || (submitting && !agentBusy)) return;
    await openBotRuntime.prompt.send();
  }

  async function stop(): Promise<void> {
    if (!sessionId) return;
    try {
      await openBotRuntime.actions.interrupt();
    } catch (reason) {
      openBotRuntime.actions.setError(errorMessage(reason));
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isChatFindShortcut(event) || !sessionId || document.querySelector('[role="dialog"]'))
        return;
      event.preventDefault();
      openBotRuntime.session.openFind();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sessionId]);

  useChatFindHighlight({
    rootRef: conversationRef,
    query: sessionHeader.find.open ? sessionHeader.find.query : "",
    messageId: sessionHeader.find.items[sessionHeader.find.activeIndex]?.message?.id,
    focusNonce: sessionHeader.find.resultFocusNonce,
    revision: messages,
  });

  // Cmd/Ctrl+I and Cmd/Ctrl+L focus the prompt.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && (key === "i" || key === "l") && !event.altKey) {
        event.preventDefault();
        composerInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Mod+Alt+D toggles the details pane (Mod+Alt+B already owns the Computer pane).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || event.key.toLowerCase() !== "d")
        return;
      event.preventDefault();
      setDetailsRoute(!detailsOpen);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function addFiles(incoming: FileList | File[]): void {
    registerPromptFiles(incoming);
  }
  function clearFiles(): void {
    openBotRuntime.prompt.clearAttachments();
  }

  async function loadOlderMessages(): Promise<void> {
    if (!sessionId || !nextMessageToken) return;
    await openBotRuntime.actions.loadOlderMessages();
  }

  async function loadMoreAgents(): Promise<void> {
    if (!nextAgentToken) return;
    try {
      await openBotRuntime.actions.loadMoreAgents();
    } catch (reason) {
      openBotRuntime.actions.setError(errorMessage(reason));
    }
  }

  async function mutateQueue(operation: () => Promise<void>): Promise<void> {
    if (!sessionId) return;
    try {
      await operation();
    } catch (reason) {
      openBotRuntime.actions.setError(errorMessage(reason));
    }
  }

  async function editQueuedTurn(turn: QueuedTurn): Promise<void> {
    const text = queuedTurnText(turn);
    await mutateQueue(() => openBotRuntime.actions.removeQueuedTurn(turn.id));
    setDraft(text === "Queued agent turn" ? "" : text);
  }

  function handleConversationScroll(): void {
    const element = conversationRef.current;
    if (!element || !sessionId) return;
    // Chromium can dispatch a layout-driven scroll while an Electron window is inactive.
    // Preserve the owner's visible jump control until an in-focus scroll or explicit jump.
    if (!document.hasFocus()) return;
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
    openBotRuntime.actions.clearSearch();
  }

  const resolveAttachmentUrl = useCallback(
    (chatId: string, attachmentId: string) =>
      openBotRuntime.client.getAttachmentDownloadUrl(chatId, attachmentId),
    [],
  );
  const rewriteUrl = useCallback((url: string) => openBotRuntime.client.rewriteTildeUrl(url), []);
  const composer = (
    <ChatPrompt
      access={sessionHeader.access}
      joining={sessionHeader.joining}
      onJoin={() => void openBotRuntime.session.join()}
      queue={{
        items: queuedTurns.map((turn) => ({
          id: turn.id,
          text: queuedTurnText(turn),
          queuePosition: turn.queue_position,
          pending: turn.id.startsWith("optimistic-queue-"),
        })),
        onEdit: (id) => {
          const turn = queuedTurns.find((candidate) => candidate.id === id);
          if (turn) void editQueuedTurn(turn);
        },
        onReorder: (id, queuePosition) =>
          void mutateQueue(() => openBotRuntime.actions.reorderQueuedTurn(id, queuePosition)),
        onRemove: (id) => void mutateQueue(() => openBotRuntime.actions.removeQueuedTurn(id)),
        onRunNow: (id) => void mutateQueue(() => openBotRuntime.actions.steerQueuedTurn(id)),
      }}
      showScrollToBottom={showScrollLatest}
      onScrollToBottom={scrollToLatest}
      status={promptStatus({
        error: promptState.error || sessionHeader.joinError || error,
        unreachable: conversation.streamStatus === "Reconnecting",
      })}
      agentAvailable={Boolean(agentId)}
      busy={agentBusy}
      submitting={submitting || promptState.phase !== "idle"}
      dragging={dragging}
      expanded={composerExpanded}
      draft={draft}
      error={error}
      attachments={files.map((pending) => ({
        id: pending.id,
        name: pending.name,
        size: pending.sizeBytes,
        removable: promptState.phase !== "sending",
        progress: pending.progress,
        status: pending.status,
        error: pending.error,
        previewUrl: pending.previewUrl,
      }))}
      inputRef={composerInputRef}
      fileInputRef={fileInputRef}
      onSubmit={(event) => void send(event)}
      onDraftChange={setDraft}
      onDragStateChange={setDragging}
      onFilesAdded={addFiles}
      onRemoveAttachment={(id) => void openBotRuntime.prompt.removeAttachment(id)}
      onStop={() => void stop()}
    />
  );

  /** Start durable agent setup; the runtime owns readiness polling and selection. */
  async function submitCreateAgent(candidateName: string, avatarId: string): Promise<void> {
    const name = candidateName.trim();
    if (!name || agentSetup.status === "starting" || agentSetup.status === "setting_up") return;
    openBotRuntime.actions.setError("");
    setCreateAgentOpen(false);
    await openBotRuntime.actions.startAgentSetup(name, avatarId);
  }

  const connectorActions: ConnectorPartActions = {
    onSetupRequired: (request) => {
      pendingConnectorRequestRef.current = request;
      setConnectorRoute(request.provider_type_id);
    },
    busy: connectorSetupState.status === "submitting" || connectorState.binding,
    onSelectAccount: (_selection, account) => {
      void chatConnectors.selectAccount(account.id);
    },
    onAddAccount: (selection) => {
      pendingConnectorSelectionRef.current = selection;
      setConnectorRoute(selection.providerTypeId);
    },
  };
  function openConnectorSetup(selection: ConnectorSelectionView): void {
    const userId = auth.session?.user.subject;
    if (!userId) return;
    void chatConnectors.open(
      {
        provider_type_id: selection.providerTypeId,
        provider_name: selection.providerName,
        icon_url: selection.iconUrl,
        target_user_id: selection.targetUserId,
        accounts: selection.accounts.map((account) => ({
          id: account.id,
          display_name: account.displayName,
          status: account.status,
        })),
      },
      userId,
    );
  }
  const closeConnectorSetup = chatConnectors.close;

  // The `?connector=<provider>` search param is the source of truth for the
  // setup modal, so OAuth returns and deep links can open it directly and the
  // back button closes it.
  useEffect(() => {
    const providerTypeId = workspaceSearch.connector;
    if (!providerTypeId) {
      if (connectorState.open) closeConnectorSetup();
      return;
    }
    if (connectorState.open && connectorState.selection?.provider_type_id === providerTypeId)
      return;
    const nativeRequest = pendingConnectorRequestRef.current;
    pendingConnectorRequestRef.current = null;
    if (nativeRequest && auth.session?.user.subject) {
      void chatConnectors.openRequest(nativeRequest, auth.session.user.subject);
      return;
    }
    const pending = pendingConnectorSelectionRef.current;
    pendingConnectorSelectionRef.current = null;
    openConnectorSetup(
      pending?.providerTypeId === providerTypeId
        ? pending
        : {
            providerTypeId,
            providerName: providerTypeId,
            accounts: [],
            credentialSources: [],
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the URL param drives this modal
  }, [workspaceSearch.connector]);

  return (
    <WorkspaceShell
      sidebarCollapsed={layout.sidebarCollapsed}
      computerOpen={layout.workspaceOpen && Boolean(selectedAgent)}
      computerFloating
      style={layout.style}
    >
      <WorkspaceSidebar
        account={
          auth.session
            ? {
                name: auth.session.user.name,
                ...(auth.session.user.email ? { email: auth.session.user.email } : {}),
                ...(auth.session.user.avatar_url
                  ? { avatarUrl: auth.session.user.avatar_url }
                  : {}),
                ...(auth.session.user.organization
                  ? { organizationName: auth.session.user.organization.name }
                  : {}),
                ...(auth.session.user.workspace
                  ? { workspaceName: auth.session.user.workspace.name }
                  : {}),
              }
            : undefined
        }
        collapsed={layout.sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
        agents={sidebarChats}
        selectedAgentId={selectedSidebarChatId}
        loading={loading}
        hasMore={Boolean(nextAgentToken)}
        searchOpen={searchOpen}
        searchValue={search}
        searchResults={searchResults}
        searching={chatSearch.status === "loading"}
        onSearchChange={setSearch}
        onSearchOpen={openSearch}
        onSearchClose={closeSearch}
        onSelectSearchResult={(id) => {
          const hit = searchHitsById.get(id);
          if (!hit) return;
          void openBotRuntime.actions
            .selectSearchHit(hit)
            .then(closeSearch)
            .catch((reason) => openBotRuntime.actions.setError(errorMessage(reason)));
        }}
        onSelectAgent={selectSidebarChat}
        onLoadMore={() => void loadMoreAgents()}
        onCreateAgent={() => setCreateAgentOpen(true)}
        onOpenPlugins={() => void navigate({ to: "/settings/plugins/tools" })}
        onOpenSettings={() => void navigate({ to: "/settings" })}
        onSwitchWorkspace={() => clientWorkspace.openWorkspaceSelector()}
        onSignOut={() => void openBotRuntime.actions.signOut()}
        onResize={layout.beginSidebarResize}
      />

      <ChatPane>
        <ChatHeader
          agentId={selectedAgent?.id}
          agentName={selectedAgent?.display_name ?? "Dispatch"}
          participants={
            sessionHeader.participants.length
              ? sessionHeader.participants
              : selectedAgent
                ? [
                    {
                      id: selectedAgent.id,
                      agentId: selectedAgent.id,
                      name: selectedAgent.display_name,
                      kind: "agent",
                      ...(selectedAgent.avatar_url ? { avatarUrl: selectedAgent.avatar_url } : {}),
                    },
                  ]
                : []
          }
          currentUserId={auth.session?.user.subject}
          source={sessionHeader.source}
          sessionName={
            sessionHeader.title &&
            !(
              selectedAgent &&
              userSessionForAgent(selectedAgent, auth.session?.user.subject ?? "")?.id ===
                sessionId &&
              sessionHeader.title === selectedAgent.display_name
            )
              ? sessionHeader.title
              : undefined
          }
          onRenameSession={sessionId ? openBotRuntime.session.rename : undefined}
          onManageParticipants={
            sessionId ? () => void openBotRuntime.session.openParticipants() : undefined
          }
          find={
            sessionHeader.find.open
              ? {
                  query: sessionHeader.find.query,
                  loading: sessionHeader.find.status === "loading",
                  error: sessionHeader.find.error,
                  matchCount: sessionHeader.find.items.length,
                  currentOrdinal: sessionHeader.find.activeIndex + 1,
                  focusNonce: sessionHeader.find.focusNonce,
                  onQueryChange: openBotRuntime.session.setFindQuery,
                  onStepNext: () => void openBotRuntime.session.stepFind(1),
                  onStepPrevious: () => void openBotRuntime.session.stepFind(-1),
                  onClose: openBotRuntime.session.closeFind,
                }
              : undefined
          }
          busy={Boolean(selectedAgent && agentBusy)}
          computerOpen={layout.workspaceOpen}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          onToggleComputer={selectedAgent ? layout.toggleWorkspace : undefined}
          detailsOpen={detailsOpen}
          onToggleDetails={selectedAgent ? () => setDetailsRoute(!detailsOpen) : undefined}
        />

        {loading && !selectedAgent ? (
          <ConversationSurface scrollRef={conversationRef} onScroll={handleConversationScroll}>
            <ConversationSkeleton />
          </ConversationSurface>
        ) : null}

        {selectedAgent ? (
          <ConversationSurface scrollRef={conversationRef} onScroll={handleConversationScroll}>
            {loadingMessages ? <ConversationSkeleton /> : null}
            {!loadingMessages ? (
              <div className="message-list">
                {nextMessageToken ? (
                  <button className="older-messages" onClick={() => void loadOlderMessages()}>
                    Load earlier messages
                  </button>
                ) : null}
                {layoutChatTranscript(
                  projectChatTranscript(visibleMessages, participantEvents, {
                    viewerUserId: auth.session?.user.subject,
                    participants: sessionHeader.participants,
                  }),
                ).map((item) => {
                  if (item.kind === "day")
                    return <TranscriptTimeSeparator key={item.id} dateTime={item.date} />;
                  if (item.kind === "participant")
                    return (
                      <ChatEventSurface key={item.id} label="Participant event">
                        <span>
                          {item.event.data.participant.display_name}{" "}
                          {item.event.type === "participant.joined" ? "joined" : "left"}
                        </span>
                      </ChatEventSurface>
                    );
                  const message = item.message;
                  const content = (
                    <MessageContent
                      connectorActions={connectorActions}
                      message={
                        item.parts.length ? { ...message, type: "ui", parts: item.parts } : message
                      }
                      resolveAttachmentUrl={resolveAttachmentUrl}
                      rewriteUrl={rewriteUrl}
                    />
                  );
                  if (item.kind === "event")
                    return (
                      <ChatEventSurface key={item.id} messageId={message.id}>
                        {content}
                      </ChatEventSurface>
                    );
                  return (
                    <ChatMessageView
                      continuedPrevious={item.continuedPrevious}
                      continuedNext={item.continuedNext}
                      key={item.id}
                      messageId={message.id}
                      role={item.alignment === "self" ? "user" : "assistant"}
                      createdAt={message.created_at}
                      message={
                        item.parts.length ? { ...message, type: "ui", parts: item.parts } : message
                      }
                      resolveAttachmentUrl={resolveAttachmentUrl}
                      rewriteUrl={rewriteUrl}
                    />
                  );
                })}
                {agentBusy ? (
                  <ThinkingIndicator>
                    {turnStatus || `${selectedAgent?.display_name || "Agent"} is working…`}
                  </ThinkingIndicator>
                ) : null}
              </div>
            ) : null}
          </ConversationSurface>
        ) : null}
        {selectedAgent ? composer : null}
      </ChatPane>

      <AgentDetailsContainer
        agentId={agentId}
        sessionId={sessionId}
        onClose={() => setDetailsRoute(false)}
        onOpenRoutine={(routineId) => setDetailsRoute(true, routineId)}
        open={detailsOpen && Boolean(selectedAgent)}
        routineParam={routineParam}
      />

      <AgentWorkspacePanel
        agentId={agentId}
        agentName={selectedAgent?.display_name || "Agent"}
        floating
        open={layout.workspaceOpen && Boolean(selectedAgent)}
        onClose={layout.toggleWorkspace}
        onResize={layout.beginWorkspaceResize}
      />
      <ChatConnectorDialog
        onRetry={chatConnectors.retry}
        state={connectorState}
        setup={connectorSetupState}
        onDownloadOutputs={() => void chatConnectors.downloadOutputs()}
        onClose={() => {
          chatConnectors.close();
          setConnectorRoute(undefined);
        }}
        onAddAccount={chatConnectors.addAccount}
        onSelectAccount={(id) => void chatConnectors.selectAccount(id)}
        onSelectTarget={(id) => void chatConnectors.selectTarget(id)}
        onSubmit={(input) => void chatConnectors.submit(input)}
        onResume={(input) => void chatConnectors.resume(input)}
        onReopenAuthorization={chatConnectors.reopenAuthorization}
      />
      <SessionParticipantsDialog
        open={sessionHeader.participantsOpen}
        participants={sessionHeader.participants}
        candidates={sessionHeader.candidates}
        currentUserId={auth.session?.user.subject}
        loading={sessionHeader.loadingParticipants}
        error={sessionHeader.error}
        pendingIds={sessionHeader.pendingParticipantIds}
        searching={sessionHeader.searchingParticipants}
        onSearch={(query) => void openBotRuntime.session.searchParticipants(query)}
        onClose={openBotRuntime.session.closeParticipants}
        onAdd={(candidate) => void openBotRuntime.session.addParticipant(candidate)}
        onRemove={(id) => void openBotRuntime.session.removeParticipant(id)}
      />
      <AddAgentDialog
        agents={agents.map((agent) => ({
          id: agent.id,
          name: agent.display_name,
          lastMessage: agent.last_message_preview || undefined,
        }))}
        creating={agentSetup.status === "starting"}
        loading={loading}
        onClose={() => setCreateAgentOpen(false)}
        onCreate={(name, avatarId) => void submitCreateAgent(name, avatarId)}
        onSelect={(id) => {
          const agent = agents.find((candidate) => candidate.id === id);
          if (agent) selectAgent(agent);
        }}
        open={createAgentOpen}
      />
      <AgentSetupDialog
        agentId={agentSetup.agent?.id ?? ""}
        avatarId={agentSetup.avatarId}
        error={agentSetup.error}
        name={agentSetup.agent?.name ?? "New bot"}
        onClose={() => openBotRuntime.actions.dismissAgentSetup()}
        open={agentSetup.status !== "idle"}
        status={agentSetup.status === "idle" ? "starting" : agentSetup.status}
      />
    </WorkspaceShell>
  );
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
