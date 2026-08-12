export { VercelRuntimeProvider, createVercelRuntimeProvider } from "./vercel.js";
export type { RuntimeCommandResult, RuntimeCommandRunner, VercelRuntimeProviderOptions } from "./vercel.js";
export { LocalRuntimeProvider, createLocalRuntimeProvider } from "./local.js";
export type { LocalRuntimeProviderOptions } from "./local.js";

import type { Deployable } from "@openbot/runtime-provider-core";
import { createLocalRuntimeProvider } from "./local.js";
import { createVercelRuntimeProvider } from "./vercel.js";

export function createRuntimeProvider(id: string): Deployable {
  if (id === "local") return createLocalRuntimeProvider();
  if (id === "vercel") return createVercelRuntimeProvider();
  throw new Error(`Unsupported runtime provider: ${id}`);
}
