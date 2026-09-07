import { createStore } from "zustand/vanilla";
import type { OpenBotClient } from "./chat/client.js";
import type { PluginsCatalog, ResourceScope } from "./contracts/plugins.js";
import { errorMessage } from "./errors.js";

function assignmentIds(current: readonly string[], agentId: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...current, agentId])] : current.filter((id) => id !== agentId);
}

function updateToolAssignment(
  catalog: PluginsCatalog,
  accountId: string,
  agentId: string,
  enabled: boolean,
): PluginsCatalog {
  return {
    ...catalog,
    tools: catalog.tools.map((entry) => ({
      ...entry,
      accounts: entry.accounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              assigned_agent_ids: assignmentIds(account.assigned_agent_ids, agentId, enabled),
            }
          : account,
      ),
    })),
  };
}

function updateSkillAssignment(
  catalog: PluginsCatalog,
  skillId: string,
  agentId: string,
  enabled: boolean,
): PluginsCatalog {
  return {
    ...catalog,
    skills: catalog.skills.map((provider) => ({
      ...provider,
      skills: provider.skills.map((skill) =>
        skill.id === skillId
          ? {
              ...skill,
              assigned_agent_ids: assignmentIds(skill.assigned_agent_ids, agentId, enabled),
            }
          : skill,
      ),
    })),
  };
}

export interface PluginsState {
  scope: ResourceScope;
  catalog: PluginsCatalog;
  loading: boolean;
  error: string;
  createdAccountId: string | null;
  createdAccountPendingAgentId: string | null;
}
export type PluginsClient = Pick<
  OpenBotClient,
  "getPluginsCatalog" | "setToolAccountForAgent" | "setSkillForAgent" | "deleteConnectorAccounts"
>;
const initial = (): PluginsState => ({
  scope: "all",
  catalog: { tools: [], skills: [] },
  loading: true,
  error: "",
  createdAccountId: null,
  createdAccountPendingAgentId: null,
});

/** One catalog owner per installation. Reset invalidates all in-flight results. */
export function createPluginsRuntime(client: PluginsClient) {
  const store = createStore<PluginsState>(initial);
  let generation = 0;
  let revision = 0;
  let refreshId = 0;
  let refreshAfterMutations = false;
  const mutations = new Map<string, Promise<boolean>>();

  async function refresh(loading = false, preserveError = false): Promise<void> {
    const current = generation;
    const request = ++refreshId;
    const before = revision;
    store.setState({
      ...(preserveError ? {} : { error: "" }),
      ...(loading ? { loading: true } : {}),
    });
    try {
      const catalog = await client.getPluginsCatalog(store.getState().scope, { refresh: true });
      if (current !== generation || request !== refreshId) return;
      // A read started before a mutation must not replace its optimistic state.
      if (before === revision && mutations.size === 0) store.setState({ catalog });
      else if (mutations.size > 0) refreshAfterMutations = true;
      else await refresh(false, true);
    } catch (reason) {
      if (current === generation && request === refreshId)
        store.setState({ error: errorMessage(reason) });
    } finally {
      if (current === generation && request === refreshId) store.setState({ loading: false });
    }
  }

  function assignment(
    kind: "tool" | "skill",
    id: string,
    agentId: string,
    enabled: boolean,
  ): Promise<boolean> {
    const key = JSON.stringify([kind, id, agentId]);
    const current = generation;
    const previous = mutations.get(key);
    // Serialize writes to a single assignment; independent assignments can proceed together.
    const operation = (async () => {
      if (previous) await previous;
      if (current !== generation) return false;
      const catalog = store.getState().catalog;
      const wasEnabled =
        kind === "tool"
          ? catalog.tools.some((entry) =>
              entry.accounts.some(
                (account) => account.id === id && account.assigned_agent_ids.includes(agentId),
              ),
            )
          : catalog.skills.some((entry) =>
              entry.skills.some(
                (skill) => skill.id === id && skill.assigned_agent_ids.includes(agentId),
              ),
            );
      const update = kind === "tool" ? updateToolAssignment : updateSkillAssignment;
      revision++;
      store.setState({ catalog: update(catalog, id, agentId, enabled), error: "" });
      try {
        if (kind === "tool") await client.setToolAccountForAgent(id, agentId, enabled);
        else await client.setSkillForAgent(id, agentId, enabled);
        return current === generation;
      } catch (reason) {
        if (current === generation)
          store.setState({
            catalog: update(store.getState().catalog, id, agentId, wasEnabled),
            error: errorMessage(reason),
          });
        return false;
      } finally {
        if (current === generation) revision++;
      }
    })();
    mutations.set(key, operation);
    void operation.finally(() => {
      if (mutations.get(key) === operation) mutations.delete(key);
      if (current === generation && mutations.size === 0 && refreshAfterMutations) {
        refreshAfterMutations = false;
        void refresh(false, true);
      }
    });
    return operation;
  }

  async function deleteAccounts(ids: readonly string[]): Promise<void> {
    const current = generation;
    revision++;
    store.setState({ error: "" });
    try {
      await client.deleteConnectorAccounts(ids);
      if (current !== generation) return;
      revision++;
      const catalog = store.getState().catalog;
      store.setState({
        catalog: {
          ...catalog,
          tools: catalog.tools.map((entry) => ({
            ...entry,
            accounts: entry.accounts.filter((account) => !ids.includes(account.id)),
          })),
        },
      });
    } catch (reason) {
      if (current !== generation) return;
      revision++;
      await refresh();
      if (current !== generation) return;
      store.setState({ error: errorMessage(reason) });
      throw reason;
    }
  }

  async function assignCreatedAccount(agentId: string): Promise<void> {
    const { createdAccountId, createdAccountPendingAgentId } = store.getState();
    if (!createdAccountId || createdAccountPendingAgentId) return;
    const current = generation;
    store.setState({ createdAccountPendingAgentId: agentId });
    const added = await assignment("tool", createdAccountId, agentId, true);
    if (current !== generation) return;
    store.setState({
      createdAccountPendingAgentId: null,
      ...(added ? { createdAccountId: null } : {}),
    });
  }

  function reset(): void {
    generation++;
    revision++;
    refreshId++;
    refreshAfterMutations = false;
    mutations.clear();
    store.setState(initial(), true);
  }
  return {
    store,
    setScope: (scope: ResourceScope) => {
      store.setState({ scope });
      return refresh(true);
    },
    refresh: (loading = false) => refresh(loading),
    deleteAccounts,
    assignCreatedAccount,
    reset,
    dispose: reset,
    setTool: (id: string, agentId: string, enabled: boolean) =>
      assignment("tool", id, agentId, enabled),
    setSkill: (id: string, agentId: string, enabled: boolean) =>
      assignment("skill", id, agentId, enabled),
    accountCreated: (id: string) => {
      store.setState({ createdAccountId: id });
      void refresh();
    },
    dismissAssignment: () => {
      if (!store.getState().createdAccountPendingAgentId)
        store.setState({ createdAccountId: null });
    },
  };
}
export type PluginsRuntime = ReturnType<typeof createPluginsRuntime>;
