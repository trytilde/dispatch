import { describe, expect, it, vi } from "vite-plus/test";
import { createSessionRuntime, type SessionClient } from "./session.js";
import { isChatFindShortcut } from "./contracts/session.js";
import { promptStatus } from "./contracts/prompt.js";
import type { ChatKitSearchHit } from "./contracts/workspace.js";

const hit = (id: string, sessionId = "chat-one"): ChatKitSearchHit => ({
  kind: "message",
  session: { id: sessionId, created_at: "2026-09-07", updated_at: "2026-09-07" },
  message: {
    id,
    type: "ui",
    session_id: sessionId,
    role: "assistant",
    created_at: "2026-09-07",
    parts: [{ type: "text", text: "A result" }],
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(overrides: Partial<SessionClient> = {}) {
  const client = {
    searchChatKit: vi.fn().mockResolvedValue({ items: [] }),
    renameSession: vi.fn().mockResolvedValue({
      id: "chat-one",
      title: "Renamed",
      created_at: "2026-09-07",
      updated_at: "2026-09-07",
    }),
    getChatChannels: vi.fn().mockResolvedValue([]),
    joinRoom: vi.fn().mockResolvedValue({}),
    getRoomRoster: vi.fn().mockResolvedValue([]),
    getRoomInvitations: vi.fn().mockResolvedValue([]),
    inviteRoomUser: vi.fn().mockResolvedValue({}),
    leaveRoom: vi.fn().mockResolvedValue(undefined),
    addRoomPerson: vi.fn().mockResolvedValue({}),
    addRoomAgent: vi.fn().mockResolvedValue({}),
    getTeamPeople: vi.fn().mockResolvedValue([]),
    revokeRoomInvitation: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  const onFindMessage = vi.fn().mockResolvedValue(undefined),
    onRenamed = vi.fn();
  const runtime = createSessionRuntime(client, {
    getAgents: () => [
      {
        id: "agent-one",
        display_name: "Assistant",
        provider_id: "http",
        status: "active",
        sessions: { items: [] },
      },
    ],
    onFindMessage,
    onRenamed,
  });
  return { runtime, client, onFindMessage, onRenamed };
}

describe("session search and header contracts", () => {
  it("queries only the selected session, exhausts pages and rejects cross-session hits", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        items: [hit("one"), hit("foreign", "chat-two")],
        next_page_token: "next",
      })
      .mockResolvedValueOnce({ items: [hit("two"), hit("one")] });
    const { runtime, onFindMessage } = fixture({ searchChatKit: search });
    runtime.select("chat-one");
    runtime.openFind();
    await runtime.search("result");
    expect(search.mock.calls).toEqual([
      ["result", "chat-one", undefined],
      ["result", "chat-one", "next"],
    ]);
    expect(runtime.store.getState().find.items.map((item) => item.message!.id)).toEqual([
      "one",
      "two",
    ]);
    await runtime.stepFind(1);
    expect(onFindMessage).toHaveBeenLastCalledWith(hit("two"));
    await runtime.stepFind(1);
    expect(onFindMessage).toHaveBeenLastCalledWith(hit("one"));
  });
  it("never falls back to a workspace-wide search without a session", async () => {
    const { runtime, client } = fixture();
    await runtime.search("query");
    runtime.openFind();
    expect(client.searchChatKit).not.toHaveBeenCalled();
    expect(runtime.store.getState().find.open).toBe(false);
  });
  it("discards results after switching sessions or replacing a query", async () => {
    const response = deferred<{ items: ChatKitSearchHit[] }>();
    const { runtime } = fixture({
      searchChatKit: vi
        .fn()
        .mockImplementationOnce(() => response.promise)
        .mockResolvedValue({ items: [hit("new", "chat-two")] }),
    });
    runtime.select("chat-one");
    const old = runtime.search("old");
    runtime.select("chat-two");
    await runtime.search("new");
    response.resolve({ items: [hit("old")] });
    await old;
    expect(runtime.store.getState().find.items[0]!.message!.id).toBe("new");
  });
  it("cancels a pending debounced request when find closes", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, client } = fixture();
      runtime.select("chat-one");
      runtime.openFind();
      runtime.setFindQuery("later");
      runtime.closeFind();
      await vi.runAllTimersAsync();
      expect(client.searchChatKit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not rename the next session when an older request resolves", async () => {
    const pending = deferred<{
      id: string;
      title: string;
      created_at: string;
      updated_at: string;
    }>();
    const { runtime, onRenamed } = fixture({ renameSession: () => pending.promise });
    runtime.select("chat-one", "Original");
    const rename = runtime.rename("Renamed");
    runtime.select("chat-two", "Second");
    pending.resolve({
      id: "chat-one",
      title: "Renamed",
      created_at: "2026-09-07",
      updated_at: "2026-09-07",
    });
    await rename;
    expect(runtime.store.getState().title).toBe("Second");
    expect(onRenamed).not.toHaveBeenCalled();
  });
  it("adds discovered people using a real roster inbox and adds agents via native participants", async () => {
    const { runtime, client } = fixture({
      getRoomRoster: vi.fn().mockResolvedValue([
        {
          participant_type: "human",
          participant_handle: "member",
          membership_source: "explicit",
          role: "owner",
          principal_user_id: "owner",
          joined_at: "2026-09-07",
          inbox: { id: "human-inbox", provider_id: "chatkit.channel.vercel-ui" },
          instance: { id: "human-instance", user_display_name: "Owner" },
        },
      ]),
      getTeamPeople: vi
        .fn()
        .mockResolvedValue([{ id: "alex", userId: "alex", name: "Alex", kind: "human" }]),
    });
    runtime.select("chat-one");
    await runtime.openParticipants();
    await runtime.searchParticipants("");
    await runtime.addParticipant({ id: "alex", userId: "alex", name: "Alex", kind: "human" });
    expect(client.addRoomPerson).toHaveBeenCalledWith("chat-one", {
      userId: "alex",
      inboxId: "human-inbox",
      name: "Alex",
    });
    expect(client.inviteRoomUser).not.toHaveBeenCalled();
    await runtime.addParticipant({
      id: "agent-one",
      agentId: "agent-one",
      name: "Assistant",
      kind: "agent",
    });
    expect(client.addRoomAgent).toHaveBeenCalledWith("chat-one", "agent-one", "Assistant");
    await runtime.removeParticipant("member-instance");
    expect(client.leaveRoom).toHaveBeenCalledWith("chat-one", "member-instance");
  });
  it("ignores stale identity search results and never adds undiscovered identities", async () => {
    const response = deferred<Awaited<ReturnType<SessionClient["getTeamPeople"]>>>();
    const { runtime, client } = fixture({
      getTeamPeople: vi.fn().mockReturnValue(response.promise),
    });
    runtime.select("chat-one");
    const search = runtime.searchParticipants("Alex");
    runtime.select("chat-two");
    response.resolve([{ id: "alex", userId: "alex", kind: "human", name: "Alex" }]);
    await search;
    expect(runtime.store.getState().candidates).toEqual([]);
    await runtime.addParticipant({ id: "forged", userId: "forged", kind: "human", name: "Forged" });
    expect(client.addRoomPerson).not.toHaveBeenCalled();
  });
  it("recognizes Ctrl/Cmd+F without taking over modified or handled shortcuts", () => {
    expect(isChatFindShortcut({ key: "f", ctrlKey: true })).toBe(true);
    expect(isChatFindShortcut({ key: "F", metaKey: true })).toBe(true);
    expect(isChatFindShortcut({ key: "f", ctrlKey: true, altKey: true })).toBe(false);
    expect(isChatFindShortcut({ key: "f", ctrlKey: true, defaultPrevented: true })).toBe(false);
  });
  it("renders no normal-operation prompt status", () => {
    expect(promptStatus({})).toBeUndefined();
    expect(promptStatus({ error: "Send failed" })).toEqual({
      kind: "failed",
      message: "Send failed",
    });
    expect(promptStatus({ unreachable: true })).toEqual({ kind: "unreachable" });
    expect(promptStatus({ actionNeeded: true })).toEqual({ kind: "action-needed" });
  });
});

function member(userId: string, providerId = "chatkit.channel.vercel-ui") {
  return {
    participant_type: "human" as const,
    participant_handle: userId,
    membership_source:
      providerId === "chatkit.channel.vercel-ui" ? ("explicit" as const) : ("provider" as const),
    role: "member" as const,
    principal_user_id: userId,
    joined_at: "2026-09-07",
    inbox: { id: "source-inbox", provider_id: providerId },
    instance: { id: `${userId}-instance`, user_display_name: userId },
  };
}
function accessRuntime(overrides: Partial<SessionClient> = {}) {
  const { client } = fixture(overrides);
  return {
    client,
    runtime: createSessionRuntime(client, {
      getAgents: () => [],
      getCurrentUser: () => ({ subject: "me", name: "My name" }),
      onRenamed: () => undefined,
      onFindMessage: async () => undefined,
    }),
  };
}
describe("session source and participation", () => {
  it("requires joining an API session when the viewer is absent", async () => {
    const { runtime } = accessRuntime({
      getRoomRoster: vi.fn().mockResolvedValue([member("someone-else")]),
    });
    runtime.select("chat-one");
    await runtime.refreshParticipants();
    expect(runtime.store.getState()).toMatchObject({
      source: { kind: "api", name: "API" },
      access: { kind: "join-required" },
    });
  });
  it("restricts an external session to its channel when identity is absent", async () => {
    const { runtime, client } = accessRuntime({
      getRoomRoster: vi.fn().mockResolvedValue([member("someone-else", "chatkit.channel.slack")]),
      getChatChannels: vi.fn().mockResolvedValue([
        {
          id: "slack",
          display_name: "Slack",
          providers: [{ id: "chatkit.channel.slack", display_name: "Slack" }],
        },
      ]),
    });
    runtime.select("chat-one");
    await runtime.refreshParticipants();
    expect(runtime.store.getState().access).toMatchObject({
      kind: "external",
      source: { name: "Slack" },
    });
    await runtime.join();
    expect(client.joinRoom).not.toHaveBeenCalled();
  });
  it("permits a verified participant even when the source is external", async () => {
    const { runtime } = accessRuntime({
      getRoomRoster: vi.fn().mockResolvedValue([member("me", "chatkit.channel.github")]),
    });
    runtime.select("chat-one");
    await runtime.refreshParticipants();
    expect(runtime.store.getState().access).toEqual({ kind: "enabled" });
  });
  it("activates input only after the server confirms the join in the roster", async () => {
    let joined = false;
    const { runtime, client } = accessRuntime({
      getRoomRoster: vi.fn(async () => [member("other"), ...(joined ? [member("me")] : [])]),
      joinRoom: vi.fn(async () => {
        joined = true;
        return member("me");
      }),
    });
    runtime.select("chat-one");
    await runtime.refreshParticipants();
    await runtime.join();
    expect(client.joinRoom).toHaveBeenCalledWith("chat-one", {
      inboxId: "source-inbox",
      userId: "me",
      name: "My name",
    });
    expect(runtime.store.getState().access).toEqual({ kind: "enabled" });
  });
  it("does not treat a successful but unverified join response as membership", async () => {
    const { runtime } = accessRuntime({
      getRoomRoster: vi.fn().mockResolvedValue([member("other")]),
      joinRoom: vi.fn().mockResolvedValue(member("me")),
    });
    runtime.select("chat-one");
    await runtime.refreshParticipants();
    await runtime.join();
    expect(runtime.store.getState().access.kind).toBe("join-required");
    expect(runtime.store.getState().joinError).toContain("not confirmed");
  });
  it("keeps failed joins disabled and permits retry", async () => {
    let joined = false;
    const joinRoom = vi
      .fn()
      .mockRejectedValueOnce(new Error("Admission denied"))
      .mockImplementation(async () => {
        joined = true;
        return member("me");
      });
    const { runtime } = accessRuntime({
      getRoomRoster: vi.fn(async () => [member("other"), ...(joined ? [member("me")] : [])]),
      joinRoom,
    });
    runtime.select("chat-one");
    await runtime.refreshParticipants();
    await runtime.join();
    expect(runtime.store.getState()).toMatchObject({
      access: { kind: "join-required" },
      joining: false,
      joinError: "Admission denied",
    });
    await runtime.join();
    expect(runtime.store.getState()).toMatchObject({ access: { kind: "enabled" }, joinError: "" });
  });
  it("ignores a join completion after switching sessions", async () => {
    const response = deferred<ReturnType<typeof member>>();
    const { runtime } = accessRuntime({
      getRoomRoster: vi.fn().mockResolvedValue([member("other")]),
      joinRoom: vi.fn().mockReturnValue(response.promise),
    });
    runtime.select("chat-one");
    await runtime.refreshParticipants();
    const joining = runtime.join();
    runtime.select("chat-two");
    await runtime.refreshParticipants();
    response.resolve(member("me"));
    await joining;
    expect(runtime.store.getState()).toMatchObject({
      sessionId: "chat-two",
      access: { kind: "join-required" },
      joining: false,
      joinError: "",
    });
  });
});
