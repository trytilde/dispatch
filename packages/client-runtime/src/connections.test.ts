import { describe, expect, it, vi } from "vite-plus/test";
import { createConnectionWorkflow, type ConnectionClient } from "./connections.js";
import type { CreateConnectorAccountResult } from "./contracts/connectors.js";
const result: CreateConnectorAccountResult = {
  status: "created",
  account: { id: "account", display_name: "Example", status: "active" },
};
const input = {
  providerTypeId: "example",
  credentialSourceTypeId: "key",
  displayName: "Example",
  userCredentialValues: { key: "test-only-secret" },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(overrides: Partial<ConnectionClient> = {}) {
  const client = {
    createConnectorAccount: vi.fn().mockResolvedValue(result),
    listConnectorProviders: vi.fn().mockResolvedValue([]),
    listConnectorAccounts: vi.fn().mockResolvedValue([result.account]),
    waitForConnectorAccount: vi.fn().mockResolvedValue(result.account),
    bindConnector: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const openAuthorization = vi.fn();
  return {
    client,
    openAuthorization,
    workflow: createConnectionWorkflow(client, { openAuthorization }),
  };
}
describe("connection workflow", () => {
  it("ignores stale provider lookup after cancellation", async () => {
    const read = deferred<Awaited<ReturnType<ConnectionClient["listConnectorProviders"]>>>();
    const { workflow } = fixture({ listConnectorProviders: () => read.promise });
    const pending = workflow.loadProvider("example");
    workflow.cancel();
    read.resolve([{ type_id: "example", name: "Example", credential_sources: [] }]);
    await pending;
    expect(workflow.store.getState()).toEqual({ status: "idle" });
  });

  it("creates and binds once without retaining input credentials", async () => {
    const { workflow, client } = fixture();
    expect(await workflow.submit(input, "bot")).toEqual(result);
    await workflow.finish();
    expect(client.bindConnector).toHaveBeenCalledExactlyOnceWith("bot", "account");
    expect(JSON.stringify(workflow.store.getState())).not.toContain("test-only-secret");
  });
  it("waits for authorization before binding", async () => {
    const active = deferred<typeof result.account>();
    const { workflow, client, openAuthorization } = fixture({
      createConnectorAccount: vi.fn().mockResolvedValue({
        ...result,
        status: "authorize",
        authorization_url: "https://example.test/oauth",
      }),
      waitForConnectorAccount: () => active.promise,
    });
    const pending = workflow.submit(input, "bot");
    await vi.waitFor(() => expect(workflow.store.getState().status).toBe("authorizing"));
    expect(client.bindConnector).not.toHaveBeenCalled();
    expect(openAuthorization).toHaveBeenCalledWith("https://example.test/oauth");
    active.resolve(result.account);
    await pending;
    expect(client.bindConnector).toHaveBeenCalledOnce();
  });
  it("ignores late account creation after cancellation", async () => {
    const created = deferred<CreateConnectorAccountResult>();
    const { workflow, client } = fixture({ createConnectorAccount: () => created.promise });
    const pending = workflow.submit(input, "bot");
    workflow.cancel();
    created.resolve(result);
    await pending;
    expect(client.bindConnector).not.toHaveBeenCalled();
    expect(workflow.store.getState()).toEqual({ status: "idle" });
  });
  it("does not finish authorization after disposal", async () => {
    const active = deferred<typeof result.account>();
    const { workflow, client } = fixture({
      createConnectorAccount: vi.fn().mockResolvedValue({
        ...result,
        status: "authorize",
        authorization_url: "https://example.test/oauth",
      }),
      waitForConnectorAccount: () => active.promise,
    });
    const pending = workflow.submit(input, "bot");
    await vi.waitFor(() => expect(workflow.store.getState().status).toBe("authorizing"));
    workflow.dispose();
    active.resolve(result.account);
    await pending;
    expect(client.bindConnector).not.toHaveBeenCalled();
  });
  it("retains the authorization state when no active account is returned", async () => {
    const { workflow, client } = fixture({
      createConnectorAccount: vi.fn().mockResolvedValue({
        ...result,
        status: "authorize",
        authorization_url: "https://example.test/oauth",
      }),
      waitForConnectorAccount: vi.fn().mockRejectedValue(new Error("offline")),
    });
    expect(await workflow.submit(input)).toBeUndefined();
    expect(workflow.store.getState().status).toBe("authorizing");
    expect(client.bindConnector).not.toHaveBeenCalled();
  });
  it("can retry failure and ignores duplicate submission", async () => {
    const created = deferred<CreateConnectorAccountResult>();
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("denied"))
      .mockImplementation(() => created.promise);
    const { workflow } = fixture({ createConnectorAccount: create });
    await workflow.submit(input);
    expect(workflow.store.getState().error).toBe("denied");
    const pending = workflow.submit(input);
    await workflow.submit(input);
    created.resolve(result);
    await pending;
    expect(create).toHaveBeenCalledTimes(2);
  });
});
