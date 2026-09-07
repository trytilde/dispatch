import { createStore } from "zustand/vanilla";
import type { OpenBotClient } from "./chat/client.js";
import {
  waitForConnectorAccountActive,
  type ConnectorProvider,
  type CreateConnectorAccountInput,
  type CreateConnectorAccountResult,
} from "./contracts/connectors.js";
import { errorMessage } from "./errors.js";

export interface ConnectionState {
  status: "idle" | "loading" | "submitting" | "authorizing" | "completing" | "complete" | "error";
  provider?: ConnectorProvider;
  authorizationUrl?: string;
  result?: CreateConnectorAccountResult;
  error?: string;
}
export interface ConnectionPlatform {
  openAuthorization(url: string): void;
}
export type ConnectionClient = Pick<
  OpenBotClient,
  | "createConnectorAccount"
  | "listConnectorAccounts"
  | "listConnectorProviders"
  | "waitForConnectorAccount"
  | "bindConnector"
>;

/** One setup operation. Credentials are arguments only, never store state or persisted data. */
export function createConnectionWorkflow(client: ConnectionClient, platform: ConnectionPlatform) {
  const store = createStore<ConnectionState>(() => ({ status: "idle" }));
  let generation = 0;
  let watcher: AbortController | undefined;
  let completion: Promise<CreateConnectorAccountResult | undefined> | undefined;
  let targetAgentId: string | undefined;

  function cancel(): void {
    generation++;
    watcher?.abort();
    watcher = undefined;
    completion = undefined;
    targetAgentId = undefined;
    store.setState({ status: "idle" }, true);
  }

  async function loadProvider(
    providerTypeId: string,
    providerName = providerTypeId,
  ): Promise<void> {
    cancel();
    const current = generation;
    store.setState({ status: "loading" });
    try {
      const providers = await client.listConnectorProviders();
      if (current !== generation) return;
      const provider = providers.find((candidate) => candidate.type_id === providerTypeId);
      store.setState(
        provider
          ? { status: "idle", provider }
          : { status: "error", error: `No connector catalog entry for ${providerName}` },
      );
    } catch (reason) {
      if (current === generation) store.setState({ status: "error", error: errorMessage(reason) });
    }
  }

  async function finish(
    result = store.getState().result,
  ): Promise<CreateConnectorAccountResult | undefined> {
    if (!result) return undefined;
    if (store.getState().status === "complete") return result;
    if (completion) return completion;
    const current = generation;
    const agentId = targetAgentId;
    store.setState({ status: "completing", error: undefined });
    completion = (async () => {
      try {
        if (agentId) await client.bindConnector(agentId, result.account.id);
        if (current !== generation) return undefined;
        watcher?.abort();
        store.setState({ status: "complete", result, error: undefined });
        return result;
      } catch (reason) {
        if (current === generation)
          store.setState({ status: "error", error: errorMessage(reason) });
        return undefined;
      } finally {
        if (current === generation) completion = undefined;
      }
    })();
    return completion;
  }

  async function submit(
    input: CreateConnectorAccountInput,
    agentId?: string,
  ): Promise<CreateConnectorAccountResult | undefined> {
    if (["submitting", "authorizing", "completing"].includes(store.getState().status))
      return undefined;
    const provider = store.getState().provider;
    cancel();
    const current = generation;
    targetAgentId = agentId;
    store.setState({ status: "submitting", ...(provider ? { provider } : {}) }, true);
    try {
      const result = await client.createConnectorAccount(input);
      if (current !== generation) return undefined;
      store.setState({ result });
      if (result.status === "authorize" && result.authorization_url) {
        store.setState({ status: "authorizing", authorizationUrl: result.authorization_url });
        platform.openAuthorization(result.authorization_url);
        watcher = new AbortController();
        const account = await waitForConnectorAccountActive(client, {
          providerTypeId: input.providerTypeId,
          accountId: result.account.id,
          signal: watcher.signal,
        });
        if (current !== generation || !account) return undefined;
        return finish({ ...result, status: "created", account });
      }
      return finish(result);
    } catch (reason) {
      if (current === generation) store.setState({ status: "error", error: errorMessage(reason) });
      return undefined;
    }
  }

  return {
    store,
    submit,
    loadProvider,
    finish,
    cancel,
    dispose: cancel,
    reopenAuthorization: () => {
      const url = store.getState().authorizationUrl;
      if (url) platform.openAuthorization(url);
    },
  };
}
export type ConnectionWorkflow = ReturnType<typeof createConnectionWorkflow>;
