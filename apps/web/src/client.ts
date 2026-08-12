import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { SandboxService } from "@openbot/contracts";
import { AgentService, ChatService, InstallationService, ProviderService } from "@openbot/control-service-proto";

const transport = createConnectTransport({
  baseUrl: `${typeof window === "undefined" ? "http://127.0.0.1:4100" : window.location.origin}/rpc`,
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export const installationClient = createClient(InstallationService, transport);
export const agentClient = createClient(AgentService, transport);
export const chatClient = createClient(ChatService, transport);
export const providerClient = createClient(ProviderService, transport);
export const sandboxClient = createClient(SandboxService, transport);
