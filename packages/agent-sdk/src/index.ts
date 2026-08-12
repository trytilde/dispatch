import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ModelMessage, ToolSet } from "ai";
import type { Provider } from "@openbot/provider-sdk";

export interface AgentRegistrationConfiguration {
  provider?: string;
  streaming?: boolean;
  timeoutMs?: number;
  skills?: readonly string[];
}

export interface AgentExecutionContext {
  request: Request;
  agent: AgentDefinition;
  sessionId: string;
  userId?: string;
  messages: readonly ModelMessage[];
  model: LanguageModelV3;
  modelId: string;
  baseSystemPrompt: string;
  tools: ToolSet;
  providers: ReadonlyMap<string, Provider>;
  signal: AbortSignal;
  close(): Promise<void>;
}

export interface AgentDefinition {
  id: string;
  displayName: string;
  description?: string;
  registration?: AgentRegistrationConfiguration;
  run(context: AgentExecutionContext): Promise<Response> | Response;
}

export function defineAgent(agent: AgentDefinition): AgentDefinition {
  return agent;
}
