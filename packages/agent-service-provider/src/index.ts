import type { Buildable, Deployable, InitializableProvider } from "@openbot/runtime-provider-core";
import { LocalAgentServiceProvider } from "./local.js";
import { VercelAgentServiceProvider } from "./vercel.js";

export type AgentServiceProvider = Buildable & Deployable & InitializableProvider;
export function createAgentServiceProvider(id: string): AgentServiceProvider {
  if (id === "local") return new LocalAgentServiceProvider();
  if (id === "vercel") return new VercelAgentServiceProvider();
  throw new Error(`Unsupported agent service provider: ${id}`);
}
export { createAgentServiceApp } from "./development.js";
export { discoverAgents } from "./discovery.js";
export { LocalAgentServiceProvider } from "./local.js";
export { VercelAgentServiceProvider } from "./vercel.js";
export type { LocalAgentServiceProviderOptions } from "./local.js";
export type { VercelAgentServiceProviderOptions } from "./vercel.js";
