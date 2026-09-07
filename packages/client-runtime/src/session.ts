import {
  API_CHAT_PROVIDER_IDS,
  type SessionSource,
  type SessionAccess,
  type ChatChannelDescriptor,
} from "./contracts/session.js";
import type { AuthenticatedUser } from "./contracts/auth.js";
import { createStore } from "zustand/vanilla";
import type { OpenBotClient } from "./chat/client.js";
import type { ChatAgent, ChatSession } from "./contracts/sidebar.js";
import type { ChatKitSearchHit } from "./contracts/workspace.js";
import type { RoomParticipant, RoomInvitation } from "./contracts/rooms.js";
import type { SessionParticipant, ParticipantCandidate } from "./contracts/session.js";
import { errorMessage } from "./errors.js";

export interface SessionFindState {
  open: boolean;
  focusNonce: number;
  resultFocusNonce: number;
  query: string;
  items: ChatKitSearchHit[];
  activeIndex: number;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
}
export interface SessionHeaderState {
  source?: SessionSource;
  access: SessionAccess;
  joining: boolean;
  joinError: string;
  sessionId: string;
  title: string;
  participants: SessionParticipant[];
  participantsOpen: boolean;
  candidates: ParticipantCandidate[];
  participantQuery: string;
  searchingParticipants: boolean;
  invitations: RoomInvitation[];
  loadingParticipants: boolean;
  pendingParticipantIds: string[];
  savingTitle: boolean;
  error: string;
  find: SessionFindState;
}
export type SessionClient = Pick<
  OpenBotClient,
  | "searchChatKit"
  | "renameSession"
  | "getRoomRoster"
  | "getRoomInvitations"
  | "inviteRoomUser"
  | "leaveRoom"
  | "addRoomAgent"
  | "addRoomPerson"
  | "getTeamPeople"
  | "revokeRoomInvitation"
  | "getChatChannels"
  | "joinRoom"
>;
const emptyFind = (): SessionFindState => ({
  open: false,
  focusNonce: 0,
  resultFocusNonce: 0,
  query: "",
  items: [],
  activeIndex: -1,
  status: "idle",
  error: "",
});
const initial = (): SessionHeaderState => ({
  access: { kind: "enabled" },
  joining: false,
  joinError: "",
  sessionId: "",
  title: "",
  participants: [],
  participantsOpen: false,
  candidates: [],
  participantQuery: "",
  searchingParticipants: false,
  invitations: [],
  loadingParticipants: false,
  pendingParticipantIds: [],
  savingTitle: false,
  error: "",
  find: emptyFind(),
});

/** One installation-scoped owner for header mutations and session-only server search. */
export function createSessionRuntime(
  client: SessionClient,
  options: {
    getAgents: () => readonly ChatAgent[];
    getCurrentUser?: () => AuthenticatedUser | undefined;
    onRenamed: (session: ChatSession) => void;
    onFindMessage: (hit: ChatKitSearchHit) => Promise<void>;
  },
) {
  const store = createStore<SessionHeaderState>(initial);
  let epoch = 0,
    searchGeneration = 0,
    rosterGeneration = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let roster: RoomParticipant[] = [];
  let channels: ChatChannelDescriptor[] = [];
  let channelsRequest: Promise<ChatChannelDescriptor[]> | undefined;
  let peopleSearchGeneration = 0;
  let directory: ParticipantCandidate[] | undefined;
  let joinedInstanceId: string | undefined;
  const updateFind = (patch: Partial<SessionFindState>) =>
    store.setState((state) => ({ find: { ...state.find, ...patch } }));
  function cancelSearch() {
    searchGeneration++;
    clearTimeout(searchTimer);
  }
  function reset() {
    epoch++;
    rosterGeneration++;
    peopleSearchGeneration++;
    directory = undefined;
    cancelSearch();
    roster = [];
    joinedInstanceId = undefined;
    store.setState(initial(), true);
  }
  async function refreshParticipants(): Promise<void> {
    const { sessionId } = store.getState();
    if (!sessionId) return;
    const current = epoch,
      request = ++rosterGeneration;
    try {
      channelsRequest ??= client.getChatChannels().catch(() => {
        channelsRequest = undefined;
        return [];
      });
      const [members, catalog] = await Promise.all([
        client.getRoomRoster(sessionId),
        channelsRequest,
      ]);
      if (epoch !== current || request !== rosterGeneration) return;
      roster = members;
      channels = catalog;
      const channelMember =
        members.find(
          (member) =>
            member.participant_type === "human" && member.membership_source === "provider",
        ) ?? members.find((member) => member.participant_type === "human");
      const providerId = channelMember?.inbox.provider_id;
      const channel = channels.find(
        (channel) =>
          channel.id === providerId ||
          channel.providers.some((provider) => provider.id === providerId),
      );
      const source: SessionSource | undefined =
        providerId && channelMember
          ? {
              kind: API_CHAT_PROVIDER_IDS.has(providerId) ? "api" : "external",
              providerId,
              inboxId: channelMember.inbox.id,
              name: API_CHAT_PROVIDER_IDS.has(providerId)
                ? "API"
                : channel?.display_name || channelMember.inbox.display_name || providerId,
              ...(channel?.icon_url ? { iconUrl: channel.icon_url } : {}),
            }
          : undefined;
      const user = options.getCurrentUser?.();
      const member = Boolean(
        user && members.some((member) => member.principal_user_id === user.subject),
      );
      const access: SessionAccess = member
        ? { kind: "enabled" }
        : source?.kind === "external"
          ? { kind: "external", source }
          : source?.kind === "api"
            ? { kind: "join-required" }
            : { kind: "unavailable", message: "Could not determine the source of this session." };
      store.setState({ source, access });
      const agents = options.getAgents();
      store.setState({
        participants: members.map((member) => {
          const agent =
            member.participant_type === "agent"
              ? agents.find((agent) => agent.id === member.inbox.id)
              : undefined;
          return {
            id: member.instance.id,
            kind: member.participant_type,
            name:
              member.instance.user_display_name ||
              agent?.display_name ||
              member.inbox.display_name ||
              "Participant",
            role: member.role,
            ...(member.principal_user_id ? { userId: member.principal_user_id } : {}),
            ...(member.participant_type === "agent"
              ? {
                  agentId: member.inbox.id,
                  ...(agent?.avatar_url ? { avatarUrl: agent.avatar_url } : {}),
                }
              : {}),
          };
        }),
      });
    } catch (error) {
      if (current === epoch && request === rosterGeneration)
        store.setState({
          error: errorMessage(error),
          access: { kind: "unavailable", message: "Could not check session participation." },
        });
    }
  }
  function select(sessionId: string, title = "") {
    if (store.getState().sessionId === sessionId) {
      if (!store.getState().savingTitle) store.setState({ title });
      return;
    }
    reset();
    store.setState({
      sessionId,
      title,
      access: sessionId ? { kind: "checking" } : { kind: "enabled" },
    });
    if (sessionId) void refreshParticipants();
  }
  function openFind() {
    if (!store.getState().sessionId) return;
    updateFind({ open: true, focusNonce: store.getState().find.focusNonce + 1 });
  }
  function closeFind() {
    cancelSearch();
    updateFind({
      open: false,
      status: store.getState().find.status === "loading" ? "idle" : store.getState().find.status,
    });
  }
  async function search(query: string): Promise<void> {
    cancelSearch();
    const request = searchGeneration,
      current = epoch;
    const sessionId = store.getState().sessionId;
    updateFind({
      query,
      items: [],
      activeIndex: -1,
      error: "",
      status: query.trim() && sessionId ? "loading" : "idle",
    });
    if (!query.trim() || !sessionId) return;
    const items: ChatKitSearchHit[] = [],
      tokens = new Set<string>();
    let token: string | null | undefined;
    try {
      do {
        const page = await client.searchChatKit(query.trim(), sessionId, token);
        if (current !== epoch || request !== searchGeneration) return;
        items.push(
          ...page.items.filter(
            (hit) => hit.kind === "message" && hit.session.id === sessionId && hit.message,
          ),
        );
        token = page.next_page_token;
        if (token && tokens.has(token)) throw new Error("Search returned a repeated page cursor");
        if (token) tokens.add(token);
      } while (token);
      const unique = [...new Map(items.map((hit) => [hit.message!.id, hit])).values()];
      updateFind({
        items: unique,
        activeIndex: unique.length ? 0 : -1,
        status: "ready",
        resultFocusNonce: store.getState().find.resultFocusNonce + 1,
      });
      if (unique[0]) await options.onFindMessage(unique[0]);
    } catch (error) {
      if (epoch === current && request === searchGeneration)
        updateFind({ status: "error", error: errorMessage(error) });
    }
  }
  function setFindQuery(query: string) {
    cancelSearch();
    updateFind({
      query,
      items: [],
      activeIndex: -1,
      error: "",
      status: query.trim() ? "loading" : "idle",
    });
    if (!query.trim()) return;
    searchTimer = setTimeout(() => {
      void search(query);
    }, 200);
  }
  async function stepFind(direction: 1 | -1) {
    const { items, activeIndex } = store.getState().find;
    if (!items.length) return;
    const next = (activeIndex + direction + items.length) % items.length;
    updateFind({ activeIndex: next, resultFocusNonce: store.getState().find.resultFocusNonce + 1 });
    await options.onFindMessage(items[next]!);
  }
  async function rename(title: string): Promise<void> {
    const { sessionId, savingTitle } = store.getState();
    if (!sessionId || savingTitle) return;
    if (!title.trim()) throw new Error("Enter a chat name");
    const current = epoch;
    store.setState({ savingTitle: true, error: "" });
    try {
      const session = await client.renameSession(sessionId, title.trim());
      if (epoch !== current) return;
      store.setState({ title: session.title ?? title.trim() });
      options.onRenamed(session);
    } catch (error) {
      if (epoch === current) store.setState({ error: errorMessage(error) });
      throw error;
    } finally {
      if (epoch === current) store.setState({ savingTitle: false });
    }
  }
  async function openParticipants(): Promise<void> {
    if (!store.getState().sessionId) return;
    const current = epoch;
    store.setState({ participantsOpen: true, loadingParticipants: true, error: "" });
    await refreshParticipants();
    if (epoch === current) store.setState({ loadingParticipants: false });
  }
  async function searchParticipants(query: string): Promise<void> {
    const current = epoch,
      request = ++peopleSearchGeneration;
    store.setState({
      participantQuery: query,
      searchingParticipants: true,
      candidates: [],
      error: "",
    });
    try {
      const people = directory ?? (await client.getTeamPeople());
      if (epoch !== current || request !== peopleSearchGeneration) return;
      directory = people;
      const agents: ParticipantCandidate[] = options.getAgents().map((agent) => ({
        id: agent.id,
        agentId: agent.id,
        kind: "agent",
        name: agent.display_name,
        ...(agent.avatar_url ? { avatarUrl: agent.avatar_url } : {}),
      }));
      const userId = options.getCurrentUser?.()?.subject;
      const candidates = [...people, ...agents].filter(
        (candidate) =>
          (!userId || candidate.userId !== userId) &&
          !store
            .getState()
            .participants.some((person) =>
              candidate.kind === "agent"
                ? person.agentId === candidate.agentId
                : person.userId === candidate.userId,
            ) &&
          `${candidate.name} ${candidate.email ?? ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      );
      store.setState({ candidates, searchingParticipants: false });
    } catch (error) {
      if (epoch === current && request === peopleSearchGeneration)
        store.setState({ searchingParticipants: false, error: errorMessage(error) });
    }
  }

  async function mutateParticipant(id: string, operation: (sessionId: string) => Promise<unknown>) {
    const state = store.getState();
    if (!state.sessionId || state.pendingParticipantIds.includes(id)) return;
    const current = epoch;
    store.setState({ pendingParticipantIds: [...state.pendingParticipantIds, id], error: "" });
    try {
      await operation(state.sessionId);
      if (epoch !== current) return;
      await refreshParticipants();
    } catch (error) {
      if (epoch === current) store.setState({ error: errorMessage(error) });
    } finally {
      if (epoch === current)
        store.setState((state) => ({
          pendingParticipantIds: state.pendingParticipantIds.filter((value) => value !== id),
        }));
    }
  }
  function addParticipant(candidate: ParticipantCandidate) {
    const discovered = store
      .getState()
      .candidates.find((item) => item.id === candidate.id && item.kind === candidate.kind);
    if (!discovered) return Promise.resolve();
    const current = epoch;
    return mutateParticipant(discovered.id, async (sessionId) => {
      if (discovered.kind === "agent")
        return client.addRoomAgent(sessionId, discovered.agentId ?? discovered.id, discovered.name);
      const inbox = roster.find(
        (member) =>
          member.participant_type === "human" &&
          API_CHAT_PROVIDER_IDS.has(member.inbox.provider_id ?? ""),
      )?.inbox.id;
      if (!inbox || !discovered.userId)
        throw new Error("This session has no API inbox for adding people.");
      return client.addRoomPerson(sessionId, {
        inboxId: inbox,
        userId: discovered.userId,
        name: discovered.name,
      });
    }).then(() => {
      if (current === epoch && !store.getState().error)
        return searchParticipants(store.getState().participantQuery);
    });
  }
  async function join(): Promise<void> {
    const { sessionId, source, joining, access } = store.getState();
    const user = options.getCurrentUser?.();
    if (
      !sessionId ||
      !source ||
      source.kind !== "api" ||
      !user ||
      joining ||
      access.kind === "enabled"
    )
      return;
    const current = epoch;
    store.setState({ joining: true, joinError: "" });
    try {
      const participant = await client.joinRoom(sessionId, {
        inboxId: source.inboxId,
        userId: user.subject,
        name: user.name,
        ...(joinedInstanceId ? { instanceId: joinedInstanceId } : {}),
      });
      if (epoch !== current) return;
      joinedInstanceId = participant.instance.id;
      await refreshParticipants();
      if (epoch === current && store.getState().access.kind !== "enabled")
        store.setState({
          joinError:
            "The session has not confirmed your identity yet. Your membership could not be activated.",
        });
    } catch (error) {
      if (epoch === current) store.setState({ joinError: errorMessage(error) });
    } finally {
      if (epoch === current) store.setState({ joining: false });
    }
  }

  return {
    store,
    select,
    refreshParticipants,
    reset,
    dispose: reset,
    openFind,
    join,
    closeFind,
    search,
    setFindQuery,
    stepFind,
    rename,
    openParticipants,
    searchParticipants,
    addParticipant,
    closeParticipants: () => store.setState({ participantsOpen: false }),
    removeParticipant: (id: string) =>
      mutateParticipant(id, (sessionId) => client.leaveRoom(sessionId, id)),
    revokeInvitation: (id: string) =>
      mutateParticipant(id, (sessionId) => client.revokeRoomInvitation(sessionId, id)),
  };
}
export type SessionRuntime = ReturnType<typeof createSessionRuntime>;
