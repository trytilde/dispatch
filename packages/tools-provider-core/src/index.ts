import type { ToolSet } from "ai";
import type { DeployableProvider } from "@openbot/runtime-provider-core";
export type { Deployable } from "@openbot/runtime-provider-core";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

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

export interface ToolsProviderDescriptor {
  id: string;
  version: string;
  displayName: string;
  capabilities: readonly ToolsProviderCapability[];
}

export type ToolsProviderCapability =
  | "tools:list"
  | "tools:invoke"
  | "tools:dynamic-discovery"
  | "model:tools"
  | "model:prompt";

export interface ToolSummary {
  name: string;
  description: string;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
}

/** An AI SDK tool paired with the name used when adding it to a ToolSet. */
export type RegisteredTool = ToolSet[string] & { readonly name: string };

export interface ToolsPromptContext {
  agentId: string;
  sessionId: string;
  userId?: string;
}

export interface ToolsProvider extends DeployableProvider {
  listTools(context: ToolsProviderCallContext): Promise<readonly ToolSummary[]>;
  invoke(name: string, input: JsonObject, context: ToolsProviderCallContext): Promise<JsonValue>;
  registerTools(context: ToolsProviderCallContext): Promise<readonly RegisteredTool[]>;
  injectPromptPart(
    context: ToolsPromptContext,
    callContext: ToolsProviderCallContext,
  ): string | undefined | Promise<string | undefined>;
  close(): Promise<void>;
}

export function asRegisteredTool(name: string, aiTool: ToolSet[string]): RegisteredTool {
  return Object.assign(aiTool, { name });
}

export function registeredToolsToToolSet(tools: readonly RegisteredTool[]): ToolSet {
  const result: ToolSet = {};
  for (const registered of tools) result[registered.name] = registered;
  return result;
}

export function providerSignal(context: ToolsProviderCallContext, fallbackMs = 30_000): AbortSignal {
  if (context.signal?.aborted) {
    throw new ToolsProviderError("deadline_exceeded", "The tools provider call was aborted", true);
  }
  if (context.signal) return context.signal;
  const remaining = context.deadline ? context.deadline.valueOf() - Date.now() : fallbackMs;
  if (remaining <= 0) {
    throw new ToolsProviderError("deadline_exceeded", "The tools provider deadline has elapsed", true);
  }
  return AbortSignal.timeout(Math.min(remaining, fallbackMs));
}
