import type { DeployableProvider } from "@tryopenbot/runtime-provider";
export type { Deployable } from "@tryopenbot/runtime-provider";

export interface SkillsProviderCallContext {
  requestId: string;
  deadline?: Date;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export type SkillsProviderErrorCode =
  | "invalid_configuration"
  | "invalid_request"
  | "not_found"
  | "deadline_exceeded"
  | "provider_unavailable"
  | "permission_denied"
  | "internal";

export class SkillsProviderError extends Error {
  constructor(
    readonly code: SkillsProviderErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SkillsProviderError";
  }
}

export interface SkillRegistry {
  id: string;
  name: string;
}

export interface ListSkillRegistriesRequest {
  namePrefix?: string;
}

export interface RegisterSkillsRequest {
  registryId?: string;
  name: string;
  description: string;
  skillIds: readonly string[];
}

/** Startup provisioning boundary for managed skill registries. */
export interface SkillProvider extends DeployableProvider {}

export function providerSignal(
  context: SkillsProviderCallContext,
  fallbackMs = 30_000,
): AbortSignal {
  if (context.signal) return context.signal;
  const remaining = context.deadline ? context.deadline.valueOf() - Date.now() : fallbackMs;
  if (remaining <= 0)
    throw new SkillsProviderError("deadline_exceeded", "The provider deadline has elapsed", true);
  return AbortSignal.timeout(Math.min(remaining, fallbackMs));
}
