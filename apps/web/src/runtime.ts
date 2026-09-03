import {
  createClientAuthAdapter,
  createDispatchClient,
  createDispatchRuntime,
  type AgentSetupState,
  type ClientAuthAdapter,
} from "@trytilde/dispatch-client-runtime";

const client = createDispatchClient();

const auth: ClientAuthAdapter = window.dispatchDesktop
  ? {
      getSession: () => window.dispatchDesktop!.authStatus(),
      signIn: () => window.dispatchDesktop!.signIn(),
      signOut: () => window.dispatchDesktop!.signOut(),
    }
  : createClientAuthAdapter(client, {
      async signIn() {
        window.location.assign("/auth/login");
      },
    });

const agentSetupStorageKey = "dispatch:agent-setup";

const agentSetupPersistence = {
  load(): AgentSetupState | null {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(agentSetupStorageKey) ?? "null",
      ) as Partial<AgentSetupState> | null;
      if (
        value?.status !== "setting_up" ||
        typeof value.jobId !== "string" ||
        typeof value.agent?.id !== "string" ||
        typeof value.agent.name !== "string"
      )
        return null;
      return {
        status: "setting_up",
        jobId: value.jobId,
        agent: value.agent,
        avatarId: typeof value.avatarId === "string" ? value.avatarId : "",
        error: "",
      };
    } catch {
      return null;
    }
  },
  save(state: AgentSetupState | null): void {
    if (state) sessionStorage.setItem(agentSetupStorageKey, JSON.stringify(state));
    else sessionStorage.removeItem(agentSetupStorageKey);
  },
};

export const dispatchRuntime = createDispatchRuntime({ client, auth, agentSetupPersistence });
