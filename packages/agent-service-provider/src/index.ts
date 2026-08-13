import type { Buildable, Deployable, InitializableProvider } from "@openbot/runtime-provider";

export type AgentServiceProvider = Buildable & Deployable & InitializableProvider;
export { createAgentServiceApp } from "./development.js";
export { discoverAgents } from "./discovery.js";
export { discoverAgentWorkspaces } from "./workspaces.js";
export { LocalAgentServiceProvider } from "./local/index.js";
export { VercelAgentServiceProvider } from "./vercel/index.js";
export type { LocalAgentServiceProviderOptions } from "./local/index.js";
export type { VercelAgentServiceProviderOptions } from "./vercel/index.js";
