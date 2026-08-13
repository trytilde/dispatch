import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import type { InferenceModelProvider } from "./core.js";
import { OPENAI_PROMPT_PART, requireCredentialValue, requireModelName } from "./openai-shared.js";

export interface OpenAIApiKeyInferenceModelProviderOptions {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

export class OpenAIApiKeyInferenceModelProvider implements InferenceModelProvider {
  readonly #openai: ReturnType<typeof createOpenAI>;

  constructor(options: OpenAIApiKeyInferenceModelProviderOptions) {
    this.#openai = createOpenAI(openAISettings(options));
  }

  model(name: string) {
    return this.#openai.responses(requireModelName(name));
  }

  injectPromptPart() {
    return OPENAI_PROMPT_PART;
  }
}

function openAISettings(
  options: OpenAIApiKeyInferenceModelProviderOptions,
): OpenAIProviderSettings {
  return {
    apiKey: requireCredentialValue(options.apiKey, "OpenAI API key"),
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    ...(options.organization ? { organization: options.organization } : {}),
    ...(options.project ? { project: options.project } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  };
}
