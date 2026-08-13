import type { Buildable, Deployable, InitializableProvider } from "@openbot/runtime-provider-core";
import { LocalControlServiceProvider } from "./local.js";
import { VercelControlServiceProvider } from "./vercel.js";

export type ControlServiceProvider = Buildable & Deployable & InitializableProvider;
export function createControlServiceProvider(id: string): ControlServiceProvider {
  if (id === "local") return new LocalControlServiceProvider();
  if (id === "vercel") return new VercelControlServiceProvider();
  throw new Error(`Unsupported control service provider: ${id}`);
}
export { LocalControlServiceProvider } from "./local.js";
export { VercelControlServiceProvider, deploymentUrl, ensureVercelProject } from "./vercel.js";
export type { LocalControlServiceProviderOptions } from "./local.js";
export type { VercelControlServiceProviderOptions } from "./vercel.js";
export type { CommandRunner, CommandResult } from "./command.js";
export { processRunner } from "./command.js";
export { installLocalService, waitForHealth } from "./local-service.js";
