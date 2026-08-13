import type { Buildable, Deployable, InitializableProvider } from "@tryopenbot/runtime-provider";

export type ControlServiceProvider = Buildable & Deployable & InitializableProvider;
export { LocalControlServiceProvider } from "./local/index.js";
export {
  VercelControlServiceProvider,
  deploymentUrl,
  ensureVercelProject,
} from "./vercel/index.js";
export type { LocalControlServiceProviderOptions } from "./local/index.js";
export type { VercelControlServiceProviderOptions } from "./vercel/index.js";
export type { CommandRunner, CommandResult } from "./command.js";
export { processRunner } from "./command.js";
export { installLocalService, waitForHealth } from "./local-service.js";
