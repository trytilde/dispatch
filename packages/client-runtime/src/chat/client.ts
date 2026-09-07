import { createNativeConnectorSetupTransport } from "../native-connector-setup.js";
import type { ProviderSetupTransport } from "../provider-setup.js";
import {
  ChatChannelsSchema,
  type ChatChannelDescriptor,
  TeamPeoplePageSchema,
  type ParticipantCandidate,
} from "../contracts/session.js";
import { z } from "zod";
import {
  AttachmentDownloadSchema,
  AttachmentSchema,
  AttachmentUploadSchema,
  type Attachment,
  type AttachmentUpload,
  type CreateAttachmentInput,
} from "../contracts/attachments.js";
import { AuthenticatedSessionSchema, type AuthenticatedSession } from "../contracts/auth.js";
import {
  type ConnectorAccount,
  type ConnectorProvider,
  type CreateConnectorAccountInput,
  type CreateConnectorAccountResult,
} from "../contracts/connectors.js";
import type { ChatEvent, SessionEvent, SessionUserState } from "../contracts/events.js";
import { SessionUserStateSchema } from "../contracts/events.js";
import type { PluginsCatalog } from "../contracts/plugins.js";
import {
  AgentSetupStartedSchema,
  AgentSetupStatusSchema,
  type AgentSetupStarted,
  type AgentSetupStatus,
} from "../contracts/agents.js";
import { ChatMessagePageSchema, type ChatMessagePage } from "../contracts/messages.js";
import {
  ConversationSnapshotSchema,
  ChatKitSearchPageSchema,
  ChatKitWorkspaceBootstrapSchema,
  SubmitTurnResponseSchema,
  type ConversationSnapshot,
  type ChatKitSearchPage,
  type ChatKitWorkspaceBootstrap,
  type SubmitTurnInput,
  type SubmitTurnResponse,
} from "../contracts/workspace.js";
import {
  type CreateRoutineInput,
  type Routine,
  type UpdateRoutineInput,
} from "../contracts/routines.js";
import {
  type CreateSignalInstanceInput,
  type SignalDelivery,
  type SignalInstance,
  type SignalProvider,
  type TestSignalInstanceInput,
  type TestSignalInstanceResult,
  type UpdateSignalInstanceInput,
} from "../contracts/signals.js";
import { createTildeRoutineClient, createTildeSignalClient } from "../tilde-settings.js";
import { createTildePluginsClient } from "../tilde-plugins.js";
import { QueuedTurnPageSchema, type QueuedTurnPage } from "../contracts/queue.js";
import {
  RoomInvitationListSchema,
  RoomInvitationSchema,
  RoomRosterSchema,
  RoomParticipantSchema,
  type InviteRoomUserInput,
  type RoomInvitation,
  type RoomParticipant,
} from "../contracts/rooms.js";
import {
  BackgroundJobPageSchema,
  BackgroundJobSchema,
  WorkGoalPageSchema,
  WorkTaskPageSchema,
  type BackgroundJob,
  type WorkSnapshot,
} from "../contracts/work.js";
import {
  ChatSessionPageSchema,
  ChatSessionSchema,
  SidebarResponseSchema,
  type AgentSortOrder,
  type ChatSession,
  type ChatSessionPage,
  type SessionSortOrder,
  type SidebarResponse,
} from "../contracts/sidebar.js";
import { ClientRequestError } from "../errors.js";
import {
  ChatKitRealtimeSocketTicketSchema,
  observeChatKitRealtimeSocket,
  type WebSocketFactory,
  type WebSocketLike,
} from "./websocket.js";
import { consumeSse } from "./sse.js";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpenBotClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  getAccessToken?: () => Promise<string | undefined>;
  createWebSocket?: WebSocketFactory;
  /** Browser by default. Native adapters must opt into Origin-free socket tickets. */
  realtimeTransport?: "browser" | "native";
  /** Public Tilde origin used only to render signal webhook URLs. */
  tildeApiBaseUrl?: string;
}

export interface OpenBotClient {
  getSession(): Promise<AuthenticatedSession | null>;
  logout(): Promise<void>;
  startAgentSetup(name: string): Promise<AgentSetupStarted>;
  getAgentSetup(jobId: string): Promise<AgentSetupStatus>;
  getSidebar(
    query?: string,
    agentSort?: AgentSortOrder,
    sessionSort?: SessionSortOrder,
    nextAgentToken?: string | null,
  ): Promise<SidebarResponse>;
  getBootstrap(activeSessionId?: string): Promise<ChatKitWorkspaceBootstrap>;
  getConversationSnapshot(sessionId: string): Promise<ConversationSnapshot>;
  searchChatKit(
    query: string,
    sessionId?: string,
    nextPageToken?: string | null,
  ): Promise<ChatKitSearchPage>;
  getAgentSessions(
    agentId: string,
    nextPageToken?: string | null,
    sessionSort?: SessionSortOrder,
  ): Promise<ChatSessionPage>;
  createSession(
    agentId: string,
    input?: { title?: string; lookupKey?: string },
  ): Promise<ChatSession>;
  renameSession(sessionId: string, title: string): Promise<ChatSession>;
  updateSessionReadState(sessionId: string, unread: boolean): Promise<SessionUserState>;
  interruptSession(sessionId: string): Promise<void>;
  getMessages(sessionId: string, nextPageToken?: string | null): Promise<ChatMessagePage>;
  getRoomRoster(sessionId: string): Promise<RoomParticipant[]>;
  addRoomAgent(sessionId: string, agentId: string, name: string): Promise<RoomParticipant>;
  getTeamPeople(): Promise<ParticipantCandidate[]>;
  getChatChannels(): Promise<ChatChannelDescriptor[]>;
  addRoomPerson(
    sessionId: string,
    input: { inboxId: string; userId: string; name: string },
  ): Promise<RoomParticipant>;
  joinRoom(
    sessionId: string,
    input: { inboxId: string; userId: string; name: string; instanceId?: string },
  ): Promise<RoomParticipant>;
  getRoomInvitations(sessionId: string): Promise<RoomInvitation[]>;
  inviteRoomUser(sessionId: string, input: InviteRoomUserInput): Promise<RoomInvitation>;
  decideRoomInvitation(
    sessionId: string,
    invitationId: string,
    decision: "accept" | "decline",
  ): Promise<RoomInvitation>;
  revokeRoomInvitation(sessionId: string, invitationId: string): Promise<RoomInvitation>;
  leaveRoom(sessionId: string, participantInstanceId: string): Promise<void>;
  sendMessage(
    agentId: string,
    sessionId: string,
    text: string,
    attachmentIds?: string[],
  ): Promise<ChatMessagePage>;
  submitTurn(agentId: string, input: SubmitTurnInput): Promise<SubmitTurnResponse>;
  observeChatKitRealtime(
    signal: AbortSignal,
    onEvent: (event: ChatEvent) => void | Promise<void>,
    onReady: () => void | Promise<void>,
  ): Promise<void>;
  observeSession(
    sessionId: string,
    signal: AbortSignal,
    onEvent: (event: SessionEvent) => void,
  ): Promise<void>;
  getQueuedTurns(sessionId: string): Promise<QueuedTurnPage>;
  steerQueuedTurn(id: string): Promise<void>;
  deleteQueuedTurn(id: string): Promise<void>;
  reorderQueuedTurn(id: string, queuePosition: number): Promise<void>;
  getWork(agentId: string, sessionId: string): Promise<WorkSnapshot>;
  getBackgroundJob(agentId: string, sessionId: string, jobId: string): Promise<BackgroundJob>;
  steerBackgroundJob(
    agentId: string,
    sessionId: string,
    jobId: string,
    instruction: string,
  ): Promise<BackgroundJob>;
  stopBackgroundJob(agentId: string, sessionId: string, jobId: string): Promise<BackgroundJob>;
  resumeBackgroundJob(
    agentId: string,
    sessionId: string,
    jobId: string,
    instruction?: string,
  ): Promise<BackgroundJob>;
  listRoutines(agentId: string): Promise<Routine[]>;
  createRoutine(input: CreateRoutineInput): Promise<Routine[]>;
  updateRoutine(groupId: string, agentId: string, input: UpdateRoutineInput): Promise<Routine[]>;
  deleteRoutine(groupId: string, agentId: string): Promise<Routine[]>;
  runRoutine(groupId: string, agentId: string): Promise<string>;
  listSignalProviders(): Promise<SignalProvider[]>;
  listSignalInstances(): Promise<SignalInstance[]>;
  createSignalInstance(input: CreateSignalInstanceInput): Promise<SignalInstance>;
  updateSignalInstance(id: string, input: UpdateSignalInstanceInput): Promise<SignalInstance>;
  deleteSignalInstance(id: string): Promise<void>;
  testSignalInstance(
    id: string,
    input?: TestSignalInstanceInput,
  ): Promise<TestSignalInstanceResult>;
  listSignalDeliveries(instanceId: string): Promise<SignalDelivery[]>;
  listConnectorProviders(): Promise<ConnectorProvider[]>;
  listConnectorAccounts(providerTypeId?: string): Promise<ConnectorAccount[]>;
  waitForConnectorAccount(accountId: string): Promise<ConnectorAccount>;
  createConnectorSetupTransport(): ProviderSetupTransport;
  listUserConnectorAccounts(userId: string, providerTypeId: string): Promise<ConnectorAccount[]>;
  createUserMcpTarget(userId: string): Promise<{ id: string; name: string }>;
  listUserMcpTargets(userId: string): Promise<Array<{ id: string; name: string }>>;
  bindConnectorForUser(userId: string, accountId: string, mcpServerId: string): Promise<void>;
  createConnectorAccount(input: CreateConnectorAccountInput): Promise<CreateConnectorAccountResult>;
  bindConnector(agentId: string, accountId: string): Promise<void>;
  deleteConnectorAccounts(accountIds: readonly string[]): Promise<void>;
  getPluginsCatalog(
    scope?: import("../contracts/plugins.js").ResourceScope,
    options?: { refresh?: boolean },
  ): Promise<PluginsCatalog>;
  setToolAccountForAgent(accountId: string, agentId: string, enabled: boolean): Promise<void>;
  setSkillForAgent(skillId: string, agentId: string, enabled: boolean): Promise<void>;
  createAttachment(sessionId: string, input: CreateAttachmentInput): Promise<AttachmentUpload>;
  createAttachments(
    sessionId: string,
    inputs: CreateAttachmentInput[],
  ): Promise<AttachmentUpload[]>;
  completeAttachment(
    sessionId: string,
    attachmentId: string,
    input: Pick<CreateAttachmentInput, "sizeBytes" | "sha256">,
  ): Promise<Attachment>;
  deleteAttachment(sessionId: string, attachmentId: string): Promise<void>;
  getAttachmentDownloadUrl(sessionId: string, attachmentId: string): Promise<string>;
  rewriteTildeUrl(value: string): string;
  rewriteTildeUploadUrl(value: string): string;
}

const SessionEnvelopeSchema = z.object({ session: ChatSessionSchema });
const ErrorBodySchema = z.object({
  error: z.string().optional(),
  detail: z.string().optional(),
  message: z.string().optional(),
});

export function createOpenBotClient(options: OpenBotClientOptions = {}): OpenBotClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl?.replace(/\/$/, "") ?? "";
  let tildeApiBaseUrl = options.tildeApiBaseUrl;
  let tildeTeamId: string | undefined;

  const resolve = (path: string): string => `${baseUrl}${path}`;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const accessToken = await options.getAccessToken?.();
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    return await fetchImplementation(resolve(path), { ...init, headers });
  }

  async function json<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
    init: RequestInit = {},
  ): Promise<z.infer<Schema>> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    headers.set("accept", "application/json");
    const response = await request(path, { ...init, headers });
    if (!response.ok) throw await responseError(response);
    return schema.parse(await response.json());
  }

  async function empty(path: string, init: RequestInit = {}): Promise<void> {
    const response = await request(path, init);
    if (!response.ok) throw await responseError(response);
  }

  function chatPath(path: string): string {
    return `/api/chat/${path}`;
  }

  const tildeSettingsTransport = {
    requestJson: (path: string, init?: RequestInit) => json(path, z.unknown(), init),
    apiBaseUrl: () => tildeApiBaseUrl,
  };
  const routines = createTildeRoutineClient(tildeSettingsTransport);
  const signals = createTildeSignalClient(tildeSettingsTransport);
  const plugins = createTildePluginsClient(tildeSettingsTransport);

  function rewriteTildeUrl(value: string): string {
    try {
      const url = new URL(value, baseUrl || "http://openbot.local");
      if (!url.pathname.startsWith("/api/v1/")) return value;
      const rootMarker = "/api/v1/chatkit/";
      const rootIndex = url.pathname.indexOf(rootMarker);
      if (rootIndex >= 0) {
        return resolve(
          chatPath(`_root/${url.pathname.slice(rootIndex + rootMarker.length)}${url.search}`),
        );
      }
      const teamMarker = "/chatkit/";
      const teamIndex = url.pathname.indexOf(teamMarker);
      return teamIndex >= 0
        ? resolve(chatPath(`${url.pathname.slice(teamIndex + teamMarker.length)}${url.search}`))
        : value;
    } catch {
      return value;
    }
  }

  function rewriteTildeUploadUrl(value: string): string {
    const rewritten = rewriteTildeUrl(value);
    if (
      rewritten.startsWith("/api/chat/") ||
      (baseUrl && rewritten.startsWith(`${baseUrl}/api/chat/`))
    )
      return rewritten;
    try {
      const url = new URL(rewritten);
      if (url.protocol === "https:" && url.hostname.endsWith(".r2.cloudflarestorage.com"))
        return resolve(chatPath(`_upload?url=${encodeURIComponent(url.toString())}`));
    } catch {
      // The platform upload adapter will report the request failure.
    }
    return rewritten;
  }

  return {
    async getSession() {
      const response = await request("/auth/session", { headers: { accept: "application/json" } });
      if (response.status === 401) return null;
      if (!response.ok) throw await responseError(response);
      const session = AuthenticatedSessionSchema.parse(await response.json());
      tildeApiBaseUrl = session.tilde?.api_base_url ?? tildeApiBaseUrl;
      tildeTeamId = session.tilde?.team_id;
      return session;
    },
    logout: () => empty("/auth/logout", { method: "POST" }),
    async startAgentSetup(name) {
      return await json("/api/agents", AgentSetupStartedSchema, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    async getAgentSetup(jobId) {
      return await json(`/api/agents/setup/${encodeURIComponent(jobId)}`, AgentSetupStatusSchema);
    },
    async getSidebar(
      query = "",
      agentSort = "updated_at",
      sessionSort = "updated_at",
      nextAgentToken,
    ) {
      const parameters = new URLSearchParams({
        agent_page_size: "50",
        session_page_size: "50",
        agent_sort: agentSort,
        session_sort: sessionSort,
      });
      if (query.trim()) parameters.set("q", query.trim());
      if (nextAgentToken) parameters.set("agent_next_page_token", nextAgentToken);
      return await json(chatPath(`workspace/sidebar?${parameters}`), SidebarResponseSchema);
    },
    async getBootstrap(activeSessionId) {
      const parameters = new URLSearchParams({
        agent_page_size: "50",
        session_page_size: "12",
        message_page_size: "100",
        queue_page_size: "25",
        agent_sort: "updated_at",
        session_sort: "updated_at",
      });
      if (activeSessionId) parameters.set("active_session_id", activeSessionId);
      return await json(
        chatPath(`workspace/bootstrap?${parameters}`),
        ChatKitWorkspaceBootstrapSchema,
      );
    },
    getConversationSnapshot: (sessionId) =>
      json(
        chatPath(
          `workspace/sessions/${encodeURIComponent(sessionId)}/snapshot?message_page_size=100&queue_page_size=25`,
        ),
        ConversationSnapshotSchema,
      ),
    async searchChatKit(query, sessionId, nextPageToken) {
      const parameters = new URLSearchParams({ q: query.trim(), page_size: "25" });
      if (sessionId) parameters.set("session_id", sessionId);
      if (nextPageToken) parameters.set("next_page_token", nextPageToken);
      return await json(chatPath(`workspace/search?${parameters}`), ChatKitSearchPageSchema);
    },
    async getAgentSessions(agentId, nextPageToken, sessionSort = "updated_at") {
      const parameters = new URLSearchParams({ page_size: "25", session_sort: sessionSort });
      if (nextPageToken) parameters.set("next_page_token", nextPageToken);
      return await json(
        chatPath(`workspace/agents/${encodeURIComponent(agentId)}/sessions?${parameters}`),
        ChatSessionPageSchema,
      );
    },
    async createSession(agentId, input) {
      const response = await json(
        chatPath(`workspace/agents/${encodeURIComponent(agentId)}/sessions`),
        SessionEnvelopeSchema,
        {
          method: "POST",
          body: JSON.stringify({
            title: input?.title || null,
            lookup_key: input?.lookupKey || null,
          }),
        },
      );
      return response.session;
    },
    renameSession: (sessionId, title) =>
      json(
        chatPath(`workspace/sessions/${encodeURIComponent(sessionId)}/rename`),
        ChatSessionSchema,
        {
          method: "PATCH",
          body: JSON.stringify({ title }),
        },
      ),
    updateSessionReadState: (sessionId, unread) =>
      json(
        chatPath(`workspace/sessions/${encodeURIComponent(sessionId)}/read-state`),
        SessionUserStateSchema,
        { method: "PUT", body: JSON.stringify({ unread }) },
      ),
    interruptSession: (sessionId) =>
      empty(chatPath(`workspace/sessions/${encodeURIComponent(sessionId)}/interrupt`), {
        method: "POST",
      }),
    async getMessages(sessionId, nextPageToken) {
      const parameters = new URLSearchParams({ page_size: "100" });
      if (nextPageToken) parameters.set("next_page_token", nextPageToken);
      return await json(
        chatPath(`workspace/sessions/${encodeURIComponent(sessionId)}/messages?${parameters}`),
        ChatMessagePageSchema,
      );
    },
    async getChatChannels() {
      const channels = await json(chatPath("chat-channels"), ChatChannelsSchema);
      return channels.map((channel) => ({
        ...channel,
        ...(channel.icon_url && tildeApiBaseUrl
          ? { icon_url: new URL(channel.icon_url, tildeApiBaseUrl).href }
          : {}),
      }));
    },
    joinRoom: (sessionId, input) =>
      json(chatPath(`sessions/${encodeURIComponent(sessionId)}/join`), RoomParticipantSchema, {
        method: "POST",
        body: JSON.stringify({
          participant: {
            participant_type: "human",
            inbox_id: input.inboxId,
            tilde_user_id: input.userId,
            display_name: input.name,
            ...(input.instanceId ? { instance_id: input.instanceId } : {}),
          },
        }),
      }),
    async getTeamPeople() {
      const people: ParticipantCandidate[] = [];
      const seen = new Set<string>();
      let token: string | null | undefined;
      do {
        const query = new URLSearchParams({ page_size: "100", user_type: "human" });
        if (token) query.set("next_page_token", token);
        const page = await json(chatPath(`_identity/team-members?${query}`), TeamPeoplePageSchema);
        people.push(
          ...page.items
            .filter((item) => item.user.user_type === "human")
            .map(({ user }) => ({
              id: user.id,
              userId: user.id,
              kind: "human" as const,
              name: user.display_name || user.email || "Team member",
              ...(user.email ? { email: user.email } : {}),
            })),
        );
        token = page.next_page_token;
        if (token && seen.has(token))
          throw new Error("People directory returned a repeated page cursor");
        if (token) seen.add(token);
      } while (token);
      return people;
    },
    addRoomPerson: (sessionId, input) =>
      json(
        chatPath(`sessions/${encodeURIComponent(sessionId)}/participants`),
        RoomParticipantSchema,
        {
          method: "POST",
          body: JSON.stringify({
            participant: {
              participant_type: "human",
              inbox_id: input.inboxId,
              tilde_user_id: input.userId,
              display_name: input.name,
            },
          }),
        },
      ),
    addRoomAgent: (sessionId, agentId, name) =>
      json(
        chatPath(`sessions/${encodeURIComponent(sessionId)}/participants`),
        RoomParticipantSchema,
        {
          method: "POST",
          body: JSON.stringify({
            participant: { participant_type: "agent", inbox_id: agentId, display_name: name },
          }),
        },
      ),
    getRoomRoster: (sessionId) =>
      json(chatPath(`sessions/${encodeURIComponent(sessionId)}/participants`), RoomRosterSchema),
    getRoomInvitations: (sessionId) =>
      json(
        chatPath(`sessions/${encodeURIComponent(sessionId)}/invitations`),
        RoomInvitationListSchema,
      ),
    inviteRoomUser: (sessionId, input) =>
      json(
        chatPath(`sessions/${encodeURIComponent(sessionId)}/invitations`),
        RoomInvitationSchema,
        {
          method: "POST",
          body: JSON.stringify({
            invitee_user_id: input.inviteeUserId,
            role: input.role ?? "member",
            participant: {
              participant_type: input.participant.type,
              inbox_id: input.participant.inboxId,
              instance_id: input.participant.instanceId,
              display_name: input.participant.displayName,
              external_id: input.participant.externalId,
              default_to_participant_instance_id: input.participant.defaultToParticipantInstanceId,
            },
          }),
        },
      ),
    decideRoomInvitation: (sessionId, invitationId, decision) =>
      json(
        chatPath(
          `sessions/${encodeURIComponent(sessionId)}/invitations/${encodeURIComponent(invitationId)}/decision`,
        ),
        RoomInvitationSchema,
        { method: "POST", body: JSON.stringify({ decision }) },
      ),
    revokeRoomInvitation: (sessionId, invitationId) =>
      json(
        chatPath(
          `sessions/${encodeURIComponent(sessionId)}/invitations/${encodeURIComponent(invitationId)}`,
        ),
        RoomInvitationSchema,
        { method: "DELETE" },
      ),
    leaveRoom: (sessionId, participantInstanceId) =>
      empty(
        chatPath(
          `sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantInstanceId)}`,
        ),
        { method: "DELETE" },
      ),
    sendMessage: (agentId, sessionId, text, attachmentIds = []) =>
      json(
        chatPath(
          `workspace/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/messages`,
        ),
        ChatMessagePageSchema,
        { method: "POST", body: JSON.stringify({ text, attachment_ids: attachmentIds }) },
      ),
    submitTurn: (agentId, input) =>
      json(
        chatPath(`workspace/agents/${encodeURIComponent(agentId)}/turns`),
        SubmitTurnResponseSchema,
        {
          method: "POST",
          body: JSON.stringify({
            session_id: input.sessionId ?? null,
            title: input.title ?? null,
            text: input.text,
            attachments: (input.attachments ?? []).map((attachment) => ({
              attachment_id: attachment.attachmentId,
              size_bytes: attachment.sizeBytes ?? null,
              sha256: attachment.sha256 ?? null,
            })),
          }),
        },
      ),
    async observeChatKitRealtime(signal, onEvent, onReady) {
      const createWebSocket =
        options.createWebSocket ??
        ((url, protocols) => new globalThis.WebSocket(url, protocols) as WebSocketLike);
      let afterRevision: number | undefined;
      let reconnectAttempt = 0;
      while (!signal.aborted) {
        try {
          const ticket = await json(
            chatPath("realtime/socket-ticket"),
            ChatKitRealtimeSocketTicketSchema,
            {
              method: "POST",
              body: JSON.stringify({ transport: options.realtimeTransport ?? "browser" }),
              signal,
            },
          );
          await observeChatKitRealtimeSocket({
            signal,
            ticket,
            afterRevision,
            createWebSocket,
            onReady: async () => await onReady(),
            onEvent,
            onRevision: (revision) => {
              afterRevision = Math.max(afterRevision ?? 0, revision);
            },
            onHealthy: () => {
              reconnectAttempt = 0;
            },
          });
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ClientRequestError && error.status < 500) throw error;
        }
        if (!signal.aborted) {
          await waitForReconnect(signal, reconnectAttempt);
          reconnectAttempt += 1;
        }
      }
    },
    async observeSession(sessionId, signal, onEvent) {
      const response = await request(
        chatPath(`session/${encodeURIComponent(sessionId)}/observe?attach_to_child_sessions=true`),
        { headers: { accept: "text/event-stream" }, signal },
      );
      if (!response.ok) throw await responseError(response);
      await consumeSse(response, signal, onEvent);
    },
    getQueuedTurns: (sessionId) => {
      const parameters = new URLSearchParams({
        page_size: "25",
        session_id: sessionId,
        status: "pending",
      });
      return json(chatPath(`agent-turn-queue?${parameters}`), QueuedTurnPageSchema);
    },
    steerQueuedTurn: (id) =>
      empty(chatPath(`agent-turn-queue/${encodeURIComponent(id)}/steer`), { method: "POST" }),
    deleteQueuedTurn: (id) =>
      empty(chatPath(`agent-turn-queue/${encodeURIComponent(id)}`), { method: "DELETE" }),
    reorderQueuedTurn: (id, queuePosition) =>
      empty(chatPath(`agent-turn-queue/${encodeURIComponent(id)}/order`), {
        method: "PATCH",
        body: JSON.stringify({ queue_position: queuePosition }),
        headers: { "content-type": "application/json" },
      }),
    async getWork(agentId, sessionId) {
      const root = `agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`;
      const [goals, tasks, jobs] = await Promise.all([
        json(chatPath(`${root}/goals?page_size=100`), WorkGoalPageSchema),
        json(chatPath(`${root}/tasks?page_size=100`), WorkTaskPageSchema),
        json(chatPath(`${root}/jobs?page_size=100`), BackgroundJobPageSchema),
      ]);
      return { goals: goals.items, tasks: tasks.items, jobs: jobs.items };
    },
    getBackgroundJob: (agentId, sessionId, jobId) =>
      json(
        chatPath(
          `agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/jobs/${encodeURIComponent(jobId)}`,
        ),
        BackgroundJobSchema,
      ),
    steerBackgroundJob: (agentId, sessionId, jobId, instruction) =>
      json(
        chatPath(
          `agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/jobs/${encodeURIComponent(jobId)}/steer`,
        ),
        BackgroundJobSchema,
        {
          method: "POST",
          body: JSON.stringify({ instruction, idempotency_key: globalThis.crypto.randomUUID() }),
        },
      ),
    stopBackgroundJob: (agentId, sessionId, jobId) =>
      json(
        chatPath(
          `agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/jobs/${encodeURIComponent(jobId)}/stop`,
        ),
        BackgroundJobSchema,
        { method: "POST", body: JSON.stringify({ reason: "Stopped by owner" }) },
      ),
    resumeBackgroundJob: (agentId, sessionId, jobId, instruction) =>
      json(
        chatPath(
          `agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}/jobs/${encodeURIComponent(jobId)}/resume`,
        ),
        BackgroundJobSchema,
        { method: "POST", body: JSON.stringify({ instruction }) },
      ),
    ...routines,
    ...signals,
    createConnectorSetupTransport: () =>
      createNativeConnectorSetupTransport(
        (path, init) => json(path, z.unknown(), init),
        () => tildeTeamId,
      ),
    async listUserConnectorAccounts(userId, providerTypeId) {
      if (!userId) throw new Error("A target user is required.");
      const schema = z.object({
        id: z.string(),
        display_name: z.string(),
        status: z.string(),
        tool_group_source_type_id: z.string(),
        credential_source_type_id: z.string().optional(),
      });
      const page = await json(
        "/api/tilde/user-tools/mcp/tool-group?page_size=200",
        z.object({ items: z.array(schema) }),
      );
      return page.items
        .filter((account) => account.tool_group_source_type_id === providerTypeId)
        .map((account) => ({
          id: account.id,
          display_name: account.display_name,
          status: account.status,
          provider_type_id: account.tool_group_source_type_id,
          credential_source_type_id: account.credential_source_type_id,
        }));
    },
    async listUserMcpTargets(_userId) {
      const schema = z.object({ id: z.string(), name: z.string(), agent_id: z.string().nullish() });
      const page = await json(
        "/api/tilde/user-tools/mcp/mcp-server?page_size=200",
        z.object({ items: z.array(schema) }),
      );
      const servers = page.items.filter((server) => !server.agent_id);
      return servers.map(({ id, name }) => ({ id, name }));
    },
    async createUserMcpTarget(userId) {
      const schema = z.object({ id: z.string(), name: z.string(), agent_id: z.string().nullish() });
      const id = `user-tools-${userId}`;
      const response = await request(
        `/api/tilde/user-tools/mcp/mcp-server/${encodeURIComponent(id)}`,
      );
      if (response.ok) {
        const existing = schema.parse(await response.json());
        if (existing.agent_id) throw new Error("This tools MCP is agent-owned.");
        return existing;
      }
      if (response.status !== 404) throw await responseError(response);
      const server = await json("/api/tilde/user-tools/mcp/mcp-server", schema, {
        method: "POST",
        body: JSON.stringify({
          id,
          name: "My tools",
          is_dynamic_tool_discovery: true,
          user_tool_federation_mode: "all",
          user_tool_federation_selections: [],
        }),
      });
      return { id: server.id, name: server.name };
    },
    async bindConnectorForUser(userId, accountId, mcpServerId) {
      if (!userId || !mcpServerId) throw new Error("Choose the target user's MCP server.");
      const server = await json(
        `/api/tilde/user-tools/mcp/mcp-server/${encodeURIComponent(mcpServerId)}`,
        z.object({ id: z.string(), agent_id: z.string().nullish() }),
      );
      if (server.agent_id)
        throw new Error("User connectors cannot be bound to an agent's own MCP server.");
      const result = await json(
        `/api/tilde/user-tools/mcp/tool-group/${encodeURIComponent(accountId)}/tools/enable-and-bind`,
        z.object({ complete: z.boolean() }),
        {
          method: "POST",
          body: JSON.stringify({
            all_tools: true,
            tool_source_type_ids: [],
            mcp_server_instance_ids: [mcpServerId],
          }),
        },
      );
      if (!result.complete)
        throw new Error("Some tools could not be enabled. Retry to finish connecting.");
    },
    async createConnectorAccount(input) {
      return await plugins.createNativeConnectorAccount(input);
    },
    bindConnector: (agentId, accountId) => plugins.setToolAccountForAgent(accountId, agentId, true),
    ...plugins,
    createAttachment: (sessionId, input) =>
      json(
        chatPath(`session/${encodeURIComponent(sessionId)}/attachment/upload`),
        AttachmentUploadSchema,
        {
          method: "POST",
          body: JSON.stringify({
            filename: input.filename,
            media_type: input.mediaType,
            size_bytes: input.sizeBytes,
            sha256: input.sha256,
          }),
        },
      ),
    async createAttachments(sessionId, inputs) {
      const response = await json(
        chatPath(`session/${encodeURIComponent(sessionId)}/attachments/upload`),
        z.object({ items: z.array(AttachmentUploadSchema) }),
        {
          method: "POST",
          body: JSON.stringify({
            items: inputs.map((input) => ({
              filename: input.filename,
              media_type: input.mediaType,
              size_bytes: input.sizeBytes,
              sha256: input.sha256,
            })),
          }),
        },
      );
      return response.items;
    },
    completeAttachment: (sessionId, attachmentId, input) =>
      json(
        chatPath(
          `session/${encodeURIComponent(sessionId)}/attachment/${encodeURIComponent(attachmentId)}/complete`,
        ),
        AttachmentSchema,
        {
          method: "POST",
          body: JSON.stringify({ size_bytes: input.sizeBytes, sha256: input.sha256 }),
        },
      ),
    deleteAttachment: (sessionId, attachmentId) =>
      empty(
        chatPath(
          `session/${encodeURIComponent(sessionId)}/attachment/${encodeURIComponent(attachmentId)}`,
        ),
        { method: "DELETE" },
      ),
    async getAttachmentDownloadUrl(sessionId, attachmentId) {
      const response = await json(
        chatPath(
          `session/${encodeURIComponent(sessionId)}/attachment/${encodeURIComponent(attachmentId)}/download-url`,
        ),
        AttachmentDownloadSchema,
      );
      return rewriteTildeUrl(response.download_url);
    },
    rewriteTildeUrl,
    rewriteTildeUploadUrl,
  };
}

async function waitForReconnect(signal: AbortSignal, attempt: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const capped = Math.min(250 * 2 ** Math.min(attempt, 8), 10_000);
    const jittered = Math.min(10_000, Math.round(capped * (0.8 + Math.random() * 0.4)));
    const timer = setTimeout(done, jittered);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

async function responseError(response: Response): Promise<ClientRequestError> {
  const parsed = ErrorBodySchema.safeParse(await response.json().catch(() => undefined));
  const body = parsed.success ? parsed.data : undefined;
  return new ClientRequestError(
    body?.detail ?? body?.message ?? body?.error ?? `OpenBot request failed (${response.status})`,
    response.status,
  );
}
