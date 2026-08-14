import type { DeployableProvider } from "@tryopenbot/runtime-provider";
export type { Deployable } from "@tryopenbot/runtime-provider";

export interface ToolsProviderCallContext {
  requestId: string;
  deadline?: Date;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export type ToolsProviderErrorCode =
  | "invalid_configuration"
  | "invalid_request"
  | "not_supported"
  | "not_found"
  | "deadline_exceeded"
  | "provider_unavailable"
  | "permission_denied"
  | "internal";

export class ToolsProviderError extends Error {
  constructor(
    readonly code: ToolsProviderErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ToolsProviderError";
  }
}

export interface ToolServer {
  id: string;
}

export interface EnsureToolServerRequest {
  id: string;
  name: string;
  dynamicToolDiscovery?: boolean;
}

/** Startup provisioning boundary for external tool servers. */
export interface ToolProvider extends DeployableProvider {}

export function providerSignal(
  context: ToolsProviderCallContext,
  fallbackMs = 30_000,
): AbortSignal {
  if (context.signal?.aborted)
    throw new ToolsProviderError("deadline_exceeded", "The tools provider call was aborted", true);
  if (context.signal) return context.signal;
  const remaining = context.deadline ? context.deadline.valueOf() - Date.now() : fallbackMs;
  if (remaining <= 0)
    throw new ToolsProviderError(
      "deadline_exceeded",
      "The tools provider deadline has elapsed",
      true,
    );
  return AbortSignal.timeout(Math.min(remaining, fallbackMs));
}
