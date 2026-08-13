import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { ComputerService } from "@openbot/computer-service-proto";

export const agentId = "hello-world";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for computer tools`);
  return value;
}

export function computerService() {
  return createClient(ComputerService, createConnectTransport({
    baseUrl: requiredEnvironment("OPENBOT_COMPUTER_SERVICE_URL"),
    httpVersion: "1.1",
  }));
}

export function computerCallOptions(signal?: AbortSignal) {
  return {
    headers: { authorization: `Bearer ${requiredEnvironment("OPENBOT_COMPUTER_SERVICE_API_KEY")}` },
    ...(signal ? { signal } : {}),
  };
}
