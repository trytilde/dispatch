import type { LanguageModelV3 } from "@ai-sdk/provider";

export interface InferenceModelPromptContext {
  agentId: string;
  sessionId: string;
  userId?: string;
}

/** Internal inference boundary used by agents and application-owned model calls. */
export interface InferenceModelProvider {
  model(name: string): LanguageModelV3;
  injectPromptPart?(
    context: InferenceModelPromptContext,
  ): string | undefined | Promise<string | undefined>;
}
