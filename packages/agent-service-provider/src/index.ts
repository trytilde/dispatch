import type { Buildable, Deployable, InitializableProvider } from "@openbot/runtime-provider-core";
import { LocalAgentServiceProvider } from "./local/index.js";
import { VercelAgentServiceProvider } from "./vercel/index.js";

export type AgentServiceProvider = Buildable & Deployable & InitializableProvider;
export function createAgentServiceProvider(id: string): AgentServiceProvider {
  if (id === "local") return new LocalAgentServiceProvider();
  if (id === "vercel") return new VercelAgentServiceProvider();
  throw new Error(`Unsupported agent service provider: ${id}`);
}
export { createAgentServiceApp } from "./development.js";
export { discoverAgents } from "./discovery.js";
export { LocalAgentServiceProvider } from "./local/index.js";
export { VercelAgentServiceProvider } from "./vercel/index.js";
export type { LocalAgentServiceProviderOptions } from "./local/index.js";
export type { VercelAgentServiceProviderOptions } from "./vercel/index.js";
