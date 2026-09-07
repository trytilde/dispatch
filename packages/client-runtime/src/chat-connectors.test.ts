import { describe, expect, it, vi } from "vite-plus/test";
import { createChatConnectorRuntime, type ChatConnectorClient } from "./chat-connectors.js";
const selection = { provider_type_id: "github", provider_name: "GitHub", accounts: [] };
function fixture(overrides: Partial<ChatConnectorClient> = {}) {
  const start = vi.fn().mockResolvedValue({
    setup_id: "setup",
    resource: { id: "account" },
    next_action: {
      type: "submit_form",
      fields: [{ name: "api_key", label: "API key", field_type: "password" }],
      submit_label: "Connect",
    },
  });
  const resume = vi.fn().mockResolvedValue({
    setup_id: "setup",
    resource: { id: "account", status: "active" },
    next_action: { type: "complete" },
  });
  const client: ChatConnectorClient = {
    createConnectorSetupTransport: () => ({ start, resume }),
    listConnectorProviders: vi
      .fn()
      .mockResolvedValue([{ type_id: "github", name: "GitHub", credential_sources: [] }]),
    listUserConnectorAccounts: vi.fn().mockResolvedValue([]),
    listUserMcpTargets: vi.fn().mockResolvedValue([{ id: "user-mcp", name: "Your tools" }]),
    createUserMcpTarget: vi.fn().mockResolvedValue({ id: "new-user-mcp", name: "Your tools" }),
    bindConnectorForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const opened = vi.fn(),
    completed = vi.fn();
  const runtime = createChatConnectorRuntime(client, {
    openAuthorization: opened,
    returnUrl: () => "https://app.test/connected",
    onComplete: completed,
  });
  return { runtime, client, start, resume, opened, completed };
}
describe("chat connector workflow", () => {
  it("submits follow-up credentials transiently and binds only the target user's MCP", async () => {
    const { runtime, client, resume } = fixture();
    await runtime.open(selection, "user-one");
    await runtime.submit({
      providerTypeId: "github",
      credentialSourceTypeId: "api-key",
      displayName: "Work",
    });
    expect(runtime.setup.store.getState().response?.next_action.type).toBe("submit_form");
    await runtime.resume({ api_key: "test-secret-not-in-snapshot" });
    expect(resume).toHaveBeenCalledWith(
      "setup",
      { api_key: "test-secret-not-in-snapshot" },
      "https://app.test/connected",
      expect.any(AbortSignal),
    );
    expect(client.bindConnectorForUser).toHaveBeenCalledWith("user-one", "account", "user-mcp");
    expect(
      JSON.stringify([runtime.store.getState(), runtime.setup.store.getState()]),
    ).not.toContain("test-secret-not-in-snapshot");
  });
  it("rejects a setup intended for another authenticated participant before requests", async () => {
    const { runtime, client } = fixture();
    await runtime.open({ ...selection, target_user_id: "someone-else" }, "user-one");
    expect(runtime.store.getState().error).toContain("another participant");
    expect(client.listUserMcpTargets).not.toHaveBeenCalled();
  });
  it("does not bind a late setup response after cancellation or another workspace/user flow", async () => {
    let resolve!: (value: unknown) => void;
    const { runtime, client, start } = fixture();
    start.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await runtime.open(selection, "user-one");
    const request = runtime.submit({
      providerTypeId: "github",
      credentialSourceTypeId: "oauth",
      displayName: "Work",
    });
    runtime.close();
    resolve({ resource: { id: "old-account" }, next_action: { type: "complete" } });
    await request;
    expect(client.bindConnectorForUser).not.toHaveBeenCalled();
    expect(runtime.store.getState().open).toBe(false);
  });
  it("keeps partial binding failure visible and retries the same account", async () => {
    const bind = vi
      .fn()
      .mockRejectedValueOnce(new Error("Mapping failed"))
      .mockResolvedValue(undefined);
    const { runtime } = fixture({
      bindConnectorForUser: bind,
      listUserConnectorAccounts: vi
        .fn()
        .mockResolvedValue([{ id: "account", display_name: "Work", status: "active" }]),
    });
    await runtime.open(selection, "user-one");
    await runtime.selectAccount("account");
    expect(runtime.store.getState().error).toBe("Mapping failed");
    await runtime.selectTarget("user-mcp");
    expect(bind).toHaveBeenCalledTimes(2);
    expect(runtime.store.getState().open).toBe(false);
  });
  it("opens OAuth once and keeps waiting until completion", async () => {
    const { runtime, start, resume, opened, client } = fixture();
    const waiting = {
      setup_id: "oauth",
      resource: { id: "account" },
      next_action: { type: "redirect", url: "https://provider.test/oauth" },
    };
    start.mockResolvedValue(waiting);
    resume.mockResolvedValueOnce(waiting);
    await runtime.open(selection, "user-one");
    await runtime.submit({
      providerTypeId: "github",
      credentialSourceTypeId: "oauth",
      displayName: "Work",
    });
    await runtime.resume();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(client.bindConnectorForUser).not.toHaveBeenCalled();
    await runtime.resume();
    expect(client.bindConnectorForUser).toHaveBeenCalledTimes(1);
  });
});

describe("native connector setup events", () => {
  const request = {
    provider_type_id: "github",
    provider_name: "GitHub",
    resource_id: "pending-account",
    hosted_url: "https://setup.test/account",
    target: { kind: "bot" as const, agent_id: "assistant", mcp_server_instance_id: "agent-mcp" },
  };
  it("resumes the existing resource and leaves target binding to the agent workflow", async () => {
    const { client, start, resume } = fixture();
    const completed = vi.fn();
    const runtime = createChatConnectorRuntime(client, {
      returnUrl: () => "https://app.test/connected",
      openAuthorization: vi.fn(),
      onSetupComplete: completed,
    });
    await runtime.openRequest(request, "user-one");
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "pending-account", providerId: "github" }),
      expect.any(AbortSignal),
    );
    expect(client.listUserConnectorAccounts).not.toHaveBeenCalled();
    await runtime.resume({ api_key: "fixture-transient-key" });
    expect(resume).toHaveBeenCalled();
    expect(completed).toHaveBeenCalledWith(request);
    expect(client.bindConnectorForUser).not.toHaveBeenCalled();
    expect(runtime.store.getState().open).toBe(false);
    expect(JSON.stringify(runtime.setup.store.getState())).not.toContain("fixture-transient-key");
  });
  it("rejects another user's personal setup without starting transport", async () => {
    const { runtime, start } = fixture();
    await runtime.openRequest(
      {
        ...request,
        target: { kind: "personal", user_id: "other", mcp_server_instance_id: "personal" },
      },
      "user-one",
    );
    expect(start).not.toHaveBeenCalled();
    expect(runtime.store.getState().error).toContain("target user");
  });
  it("ignores native completion from a cancelled flow", async () => {
    const { client, start } = fixture();
    let resolve!: (value: unknown) => void;
    start.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const completed = vi.fn();
    const runtime = createChatConnectorRuntime(client, {
      returnUrl: () => "https://app.test/connected",
      openAuthorization: vi.fn(),
      onSetupComplete: completed,
    });
    const pending = runtime.openRequest(request, "user-one");
    runtime.close();
    resolve({
      setup_id: "setup",
      resource: { id: request.resource_id },
      next_action: { type: "complete" },
    });
    await pending;
    expect(completed).not.toHaveBeenCalled();
    expect(runtime.store.getState().open).toBe(false);
  });
});

describe("provider-only connection setup", () => {
  it("completes without account selection or MCP assignment", async () => {
    const start = vi.fn(async () => ({
      setup_id: "setup",
      resource: { id: "account" },
      next_action: {
        type: "submit_form",
        fields: [{ name: "secret", label: "Secret", field_type: "password", required: true }],
        submit_label: "Finish",
      },
    }));
    const resume = vi.fn(async () => ({
      setup_id: "setup",
      resource: { id: "account", status: "active" },
      next_action: { type: "complete" },
    }));
    const completed = vi.fn();
    const runtime = createChatConnectorRuntime(
      { createConnectorSetupTransport: () => ({ start, resume }) },
      {
        returnUrl: () => "https://app.test/connected",
        openAuthorization: vi.fn(),
        onProviderComplete: completed,
      },
    );
    runtime.openProvider({ type_id: "github", name: "GitHub", credential_sources: [] });
    await runtime.submit({
      providerTypeId: "github",
      credentialSourceTypeId: "oauth",
      displayName: "Work",
    });
    await runtime.resume({ secret: "fixture-secret" });
    expect(completed).toHaveBeenCalledWith("account");
    expect(runtime.store.getState().open).toBe(false);
    expect(JSON.stringify(runtime.setup.store.getState())).not.toContain("fixture-secret");
  });
});
