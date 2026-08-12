import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { DeployableProvider } from "@openbot/runtime-provider-core";
export type { Deployable } from "@openbot/runtime-provider-core";

export interface InferenceModelPromptContext {
  agentId: string;
  sessionId: string;
  userId?: string;
}

/** Internal inference boundary used by agents and application-owned model calls. */
export interface InferenceModelProvider extends DeployableProvider {
  model(name: string): LanguageModelV3;
  injectPromptPart?(
    context: InferenceModelPromptContext,
  ): string | undefined | Promise<string | undefined>;
}
