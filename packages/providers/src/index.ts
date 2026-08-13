export * from "./microsandbox.js";
export * from "./capabilities.js";
export * from "./env.js";
export * from "./openai.js";
export * from "./prompt.js";
export * from "./sandbox-bootstrap.js";
export * from "./tilde.js";
export * from "./vercel-sandbox.js";
export * from "./vercel.js";

import type { SandboxProvider } from "@openbot/provider-sdk";
import { MicrosandboxProvider } from "./microsandbox.js";
import { VercelSandboxProvider } from "./vercel-sandbox.js";

let sandboxProvider: SandboxProvider | undefined;

export function defaultSandboxProvider(): SandboxProvider {
  if (sandboxProvider) return sandboxProvider;
  sandboxProvider =
    process.env.VERCEL ||
    process.env.OPENBOT_SANDBOX_PROVIDER === "vercel" ||
    process.env.OPENBOT_SANDBOX_PROVIDER === "vercel-sandbox"
      ? new VercelSandboxProvider()
      : new MicrosandboxProvider();
  return sandboxProvider;
}
