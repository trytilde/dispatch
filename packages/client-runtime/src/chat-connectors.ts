import { createStore } from "zustand/vanilla";
import { createProviderSetupWorkflow, type ProviderSetupStartInput } from "./provider-setup.js";
import type { OpenBotClient } from "./chat/client.js";
import type {
  ConnectorSelection,
  ConnectorProvider,
  CreateConnectorAccountInput,
  ConnectorSetupRequest,
} from "./contracts/connectors.js";
import { errorMessage } from "./errors.js";
export interface ChatConnectorState {
  domain?: ProviderSetupStartInput["domain"];
  providerOnly?: boolean;
  request?: ConnectorSetupRequest;
  selection?: ConnectorSelection;
  userId?: string;
  provider?: ConnectorProvider;
  open: boolean;
  stage: "accounts" | "setup" | "target";
  loading: boolean;
  binding: boolean;
  targets: Array<{ id: string; name: string }>;
  targetId?: string;
  accountId?: string;
  error?: string;
  completedAccountId?: string;
}
export type ChatConnectorClient = Pick<
  OpenBotClient,
  | "createConnectorSetupTransport"
  | "listConnectorProviders"
  | "listUserConnectorAccounts"
  | "listUserMcpTargets"
  | "createUserMcpTarget"
  | "bindConnectorForUser"
>;
export function createChatConnectorRuntime(
  client: ChatConnectorClient | Pick<ChatConnectorClient, "createConnectorSetupTransport">,
  platform: {
    openAuthorization(url: string): void;
    returnUrl: (providerId?: string) => string;
    saveSecretOutputs?: (outputs: Record<string, unknown>) => void | Promise<void>;
    onProviderComplete?: (accountId?: string) => void | Promise<void>;
    onSetupComplete?: (request: ConnectorSetupRequest) => void | Promise<void>;
    onComplete?: (accountId: string, mcpServerId: string) => void | Promise<void>;
  },
) {
  const initial = (): ChatConnectorState => ({
    open: false,
    stage: "accounts",
    loading: false,
    binding: false,
    targets: [],
  });
  const store = createStore<ChatConnectorState>(initial);
  const transport = client.createConnectorSetupTransport();
  const legacyClient = (): ChatConnectorClient => {
    if (!("bindConnectorForUser" in client))
      throw new Error("This client supports provider setup only.");
    return client;
  };
  const setup = createProviderSetupWorkflow(transport);
  let openedAuthorization: string | undefined;
  let epoch = 0;
  let authorizationPoll: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    clearTimeout(authorizationPoll);
    authorizationPoll = undefined;
    openedAuthorization = undefined;
    epoch++;
    setup.cancel();
    store.setState(initial(), true);
  };
  async function bind() {
    const state = store.getState();
    if (!state.userId || !state.accountId || !state.targetId || state.binding) return;
    const current = epoch;
    store.setState({ binding: true, error: undefined });
    try {
      await legacyClient().bindConnectorForUser(state.userId, state.accountId, state.targetId);
      if (current !== epoch) return;
      await platform.onComplete?.(state.accountId, state.targetId);
      if (current === epoch)
        store.setState({ open: false, binding: false, completedAccountId: state.accountId });
    } catch (error) {
      if (current === epoch) store.setState({ binding: false, error: errorMessage(error) });
    }
  }
  async function completeAccount(accountId: string) {
    if (!store.getState().open) return;
    store.setState({ accountId, stage: "target" });
    const state = store.getState(),
      current = epoch;
    if (!state.targets.length && state.userId) {
      store.setState({ binding: true });
      try {
        const target = await legacyClient().createUserMcpTarget(state.userId);
        if (current !== epoch) return;
        store.setState({ targets: [target], targetId: target.id, binding: false });
      } catch (error) {
        if (current === epoch) store.setState({ binding: false, error: errorMessage(error) });
        return;
      }
    }
    if (store.getState().targetId) await bind();
  }
  async function selectAccount(accountId: string) {
    const state = store.getState();
    const account = state.selection?.accounts.find((account) => account.id === accountId);
    if (!account || !state.selection) return;
    if (account.status === "active") return completeAccount(accountId);
    const current = epoch;
    store.setState({ stage: "setup", accountId });
    const result = await setup.start({
      providerId: state.selection.provider_type_id,
      resourceId: accountId,
      returnUrl: platform.returnUrl(store.getState().selection?.provider_type_id),
    });
    if (current === epoch) await handleResult(result);
  }
  async function handleResult(result: Awaited<ReturnType<typeof setup.start>>) {
    if (!result) return;
    clearTimeout(authorizationPoll);
    authorizationPoll = undefined;
    const action = result.next_action;
    if (action.type === "redirect") {
      const url = new URL(action.url);
      if (!["https:", "http:"].includes(url.protocol)) {
        store.setState({ error: "The authorization URL is invalid." });
        return;
      }
      if (openedAuthorization !== url.href) {
        openedAuthorization = url.href;
        platform.openAuthorization(url.href);
      }
      if (result.setup_id) {
        const current = epoch;
        authorizationPoll = setTimeout(() => {
          void setup
            .resume({}, platform.returnUrl(store.getState().selection?.provider_type_id))
            .then((next) => {
              if (current === epoch) return handleResult(next);
            });
        }, 1000);
      }
    }
    if (action.type === "complete") {
      if (store.getState().providerOnly) {
        const current = epoch;
        try {
          await platform.onProviderComplete?.(result.resource?.id);
          if (current === epoch) {
            if (action.redirect_url) {
              const redirect = new URL(action.redirect_url);
              if (!["https:", "http:", "openbot:"].includes(redirect.protocol))
                throw new Error("The completion URL is invalid.");
              platform.openAuthorization(redirect.href);
            }
            store.setState({ open: false, completedAccountId: result.resource?.id });
          }
        } catch (error) {
          if (current === epoch) store.setState({ error: errorMessage(error) });
        }
        return;
      }
      const request = store.getState().request;
      if (request) {
        const current = epoch;
        try {
          await platform.onSetupComplete?.(request);
          if (current === epoch)
            store.setState({ open: false, completedAccountId: request.resource_id });
        } catch (error) {
          if (current === epoch) store.setState({ error: errorMessage(error) });
        }
        return;
      }
      const id = result.resource?.id ?? store.getState().accountId;
      if (!id) {
        store.setState({ error: "Provider setup has not returned the connected account." });
        return;
      }
      await completeAccount(id);
    } else if (result.resource?.id) store.setState({ accountId: result.resource.id });
  }
  async function openRequest(request: ConnectorSetupRequest, userId: string) {
    close();
    const current = epoch;
    const selection: ConnectorSelection = {
      provider_type_id: request.provider_type_id,
      provider_name: request.provider_name,
      icon_url: request.icon_url ?? undefined,
      accounts: [],
    };
    store.setState({
      open: true,
      request,
      selection,
      userId,
      stage: "setup",
      loading: true,
      provider: {
        type_id: request.provider_type_id,
        name: request.provider_name,
        icon_url: request.icon_url ?? undefined,
        credential_sources: [],
      },
    });
    if (request.target?.kind === "personal" && request.target.user_id !== userId) {
      store.setState({ loading: false, error: "Open this setup as the target user." });
      return;
    }
    const result = await setup.start({
      providerId: request.provider_type_id,
      resourceId: request.resource_id,
      ...(request.target?.kind === "personal"
        ? { personalUserId: userId, authorizationUrl: request.hosted_url }
        : {}),
      returnUrl: platform.returnUrl(store.getState().selection?.provider_type_id),
    });
    if (current !== epoch) return;
    store.setState({ loading: false });
    await handleResult(result);
  }
  return {
    store,
    setup,
    openRequest,
    openProvider(provider: ConnectorProvider, domain: ProviderSetupStartInput["domain"] = "mcp") {
      close();
      store.setState({
        open: true,
        providerOnly: true,
        domain,
        stage: "setup",
        provider,
        selection: {
          provider_type_id: provider.type_id,
          provider_name: provider.name,
          icon_url: provider.icon_url,
          accounts: [],
        },
      });
    },
    retry: () => {
      const state = store.getState();
      if (state.request && state.userId) void openRequest(state.request, state.userId);
    },
    async open(selection: ConnectorSelection, userId: string) {
      close();
      const current = epoch;
      if (selection.target_user_id && selection.target_user_id !== userId) {
        store.setState({
          open: true,
          selection,
          error: "This setup is for another participant. Open it as the target user.",
        });
        return;
      }
      store.setState({
        open: true,
        selection,
        userId,
        loading: true,
        stage: selection.accounts.length ? "accounts" : "setup",
      });
      try {
        const [providers, targets, accounts] = await Promise.all([
          legacyClient().listConnectorProviders(),
          legacyClient().listUserMcpTargets(userId),
          legacyClient().listUserConnectorAccounts(userId, selection.provider_type_id),
        ]);
        if (current !== epoch) return;
        const provider = providers.find((item) => item.type_id === selection.provider_type_id);
        if (!provider) throw new Error("This provider is not available in the current workspace.");
        store.setState({
          provider,
          selection: { ...selection, accounts },
          stage: accounts.length ? "accounts" : "setup",
          targets,
          targetId: targets.length === 1 ? targets[0]!.id : undefined,
          loading: false,
        });
      } catch (error) {
        if (current === epoch) store.setState({ loading: false, error: errorMessage(error) });
      }
    },
    close,
    dispose: close,
    addAccount: () => store.setState({ stage: "setup", error: undefined }),
    selectAccount,
    async selectTarget(id: string) {
      if (!store.getState().targets.some((target) => target.id === id)) return;
      store.setState({ targetId: id });
      await bind();
    },
    async submit(input: CreateConnectorAccountInput) {
      const current = epoch;
      const result = await setup.start({
        providerId: input.providerTypeId,
        domain: store.getState().domain ?? "mcp",
        authMethodId: store
          .getState()
          .provider?.credential_sources.find(
            (source) => source.type_id === input.credentialSourceTypeId,
          )?.uses_default_auth
          ? undefined
          : input.credentialSourceTypeId,
        formValues: {
          displayName: input.displayName,
          ...input.resourceServerValues,
          ...input.userCredentialValues,
        },
        returnUrl: platform.returnUrl(store.getState().selection?.provider_type_id),
      });
      if (current === epoch) await handleResult(result);
    },
    async resume(input: Record<string, unknown> = {}) {
      const current = epoch;
      const result = await setup.resume(
        input,
        platform.returnUrl(store.getState().selection?.provider_type_id),
      );
      if (current === epoch) await handleResult(result);
    },
    async downloadOutputs() {
      const response = setup.store.getState().response;
      if (!response?.setup_id || !platform.saveSecretOutputs) {
        store.setState({ error: "Secret output download is unavailable in this client." });
        return;
      }
      const outputs = transport.consumeSecretOutputs?.(response.setup_id);
      if (!outputs) {
        store.setState({ error: "These outputs have already been consumed or expired." });
        return;
      }
      const current = epoch;
      try {
        await platform.saveSecretOutputs(outputs);
        if (current === epoch)
          await handleResult({ ...response, next_action: { type: "complete" } });
      } catch {
        if (current === epoch) store.setState({ error: "Could not save the provider outputs." });
      }
    },
    reopenAuthorization(this: void) {
      const action = setup.store.getState().response?.next_action;
      if (action?.type === "redirect") platform.openAuthorization(action.url);
    },
  };
}
