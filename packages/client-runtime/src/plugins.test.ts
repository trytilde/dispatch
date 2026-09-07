import { describe, expect, it, vi } from "vite-plus/test";
import { createPluginsRuntime, type PluginsClient } from "./plugins.js";
import type { PluginsCatalog } from "./contracts/plugins.js";
const catalog: PluginsCatalog = {
  tools: [
    {
      provider: { type_id: "example", name: "Example", credential_sources: [] },
      accounts: [
        { id: "account", display_name: "Example", status: "active", assigned_agent_ids: [] },
      ],
    },
  ],
  skills: [
    {
      id: "skills",
      name: "Skills",
      description: "",
      categories: [],
      skills: [{ id: "skill", name: "Skill", description: "", assigned_agent_ids: [] }],
    },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(overrides: Partial<PluginsClient> = {}) {
  const client = {
    getPluginsCatalog: vi.fn().mockResolvedValue(catalog),
    setToolAccountForAgent: vi.fn().mockResolvedValue(undefined),
    setSkillForAgent: vi.fn().mockResolvedValue(undefined),
    deleteConnectorAccounts: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { client, runtime: createPluginsRuntime(client) };
}
describe("plugins runtime", () => {
  it("rolls back a failed assignment without losing a different successful assignment", async () => {
    const { runtime } = fixture({
      setToolAccountForAgent: vi
        .fn()
        .mockRejectedValueOnce(new Error("denied"))
        .mockResolvedValue(undefined),
    });
    await runtime.refresh();
    await Promise.all([
      runtime.setTool("account", "first", true),
      runtime.setTool("account", "second", true),
    ]);
    expect(runtime.store.getState().catalog.tools[0]!.accounts[0]!.assigned_agent_ids).toEqual([
      "second",
    ]);
    expect(runtime.store.getState().error).toBe("denied");
  });
  it("serializes repeated writes to one assignment", async () => {
    const first = deferred<void>();
    const set = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const { runtime } = fixture({ setToolAccountForAgent: set });
    await runtime.refresh();
    const add = runtime.setTool("account", "bot", true);
    const remove = runtime.setTool("account", "bot", false);
    expect(set).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all([add, remove]);
    expect(runtime.store.getState().catalog.tools[0]!.accounts[0]!.assigned_agent_ids).toEqual([]);
  });
  it("does not overwrite a newer mutation with a stale catalog read", async () => {
    const read = deferred<PluginsCatalog>();
    const updated = {
      ...catalog,
      skills: catalog.skills.map((provider) => ({
        ...provider,
        skills: provider.skills.map((skill) => ({ ...skill, assigned_agent_ids: ["bot"] })),
      })),
    };
    const get = vi
      .fn()
      .mockResolvedValue(updated)
      .mockResolvedValueOnce(catalog)
      .mockImplementationOnce(() => read.promise);
    const { runtime } = fixture({ getPluginsCatalog: get });
    await runtime.refresh();
    const refreshing = runtime.refresh();
    await runtime.setSkill("skill", "bot", true);
    read.resolve(catalog);
    await refreshing;
    expect(runtime.store.getState().catalog.skills[0]!.skills[0]!.assigned_agent_ids).toEqual([
      "bot",
    ]);
  });
  it("refreshes after assigning a newly created account before its catalog read settles", async () => {
    const read = deferred<PluginsCatalog>();
    const grant = deferred<void>();
    const empty = { ...catalog, tools: catalog.tools.map((entry) => ({ ...entry, accounts: [] })) };
    const assigned = {
      ...catalog,
      tools: catalog.tools.map((entry) => ({
        ...entry,
        accounts: entry.accounts.map((account) => ({ ...account, assigned_agent_ids: ["bot"] })),
      })),
    };
    const get = vi
      .fn()
      .mockResolvedValue(assigned)
      .mockResolvedValueOnce(empty)
      .mockImplementationOnce(() => read.promise);
    const { runtime } = fixture({
      getPluginsCatalog: get,
      setToolAccountForAgent: () => grant.promise,
    });
    await runtime.refresh();
    runtime.accountCreated("account");
    const assigning = runtime.assignCreatedAccount("bot");
    read.resolve(catalog);
    await Promise.resolve();
    grant.resolve();
    await assigning;
    await vi.waitFor(() => expect(runtime.store.getState().catalog).toEqual(assigned));
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("reconciles after partial deletion failure", async () => {
    const { runtime, client } = fixture({
      deleteConnectorAccounts: vi.fn().mockRejectedValue(new Error("partial failure")),
    });
    await runtime.refresh();
    await expect(runtime.deleteAccounts(["account"])).rejects.toThrow("partial failure");
    expect(client.getPluginsCatalog).toHaveBeenCalledTimes(2);
    expect(runtime.store.getState().error).toBe("partial failure");
  });
  it("isolates installation stores and ignores pending reads after reset", async () => {
    const read = deferred<PluginsCatalog>();
    const { runtime } = fixture({ getPluginsCatalog: () => read.promise });
    const other = fixture().runtime;
    const refreshing = runtime.refresh();
    runtime.reset();
    read.resolve(catalog);
    await refreshing;
    await other.refresh();
    expect(runtime.store.getState().catalog.tools).toEqual([]);
    expect(other.store.getState().catalog.tools).toHaveLength(1);
  });
  it("keeps bot selection open on failure and dismisses after a successful retry", async () => {
    const { runtime } = fixture({
      setToolAccountForAgent: vi
        .fn()
        .mockRejectedValueOnce(new Error("denied"))
        .mockResolvedValue(undefined),
    });
    await runtime.refresh();
    runtime.accountCreated("account");
    await runtime.assignCreatedAccount("bot");
    expect(runtime.store.getState().createdAccountId).toBe("account");
    await runtime.assignCreatedAccount("bot");
    expect(runtime.store.getState().createdAccountId).toBeNull();
  });
});
