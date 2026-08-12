export { VercelRuntimeProvider, createVercelRuntimeProvider } from "./vercel.js";
export type { RuntimeCommandResult, RuntimeCommandRunner, VercelRuntimeProviderOptions } from "./vercel.js";

import type { DeployableProvider } from "@openbot/runtime-provider-core";
import { createVercelRuntimeProvider } from "./vercel.js";

export function createRuntimeProvider(id: string): DeployableProvider {
  if (id === "vercel") return createVercelRuntimeProvider();
  throw new Error(`Unsupported runtime provider: ${id}`);
}
