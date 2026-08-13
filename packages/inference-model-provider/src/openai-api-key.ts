import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import type { ProviderInitialization } from "@tryopenbot/runtime-provider";
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

export const openAIApiKeyProviderInitialization: ProviderInitialization = {
  id: "openai-api-key",
  label: "OpenAI API",
  questions: [
    {
      id: "openai-api-key",
      prompt: "OpenAI API key",
      description: "API key used by the default OpenAI inference model provider.",
      input: "secret",
      required: true,
      destination: { kind: "secret", key: "OPENAI_API_KEY" },
    },
  ],
};

export class OpenAIApiKeyInferenceModelProvider implements InferenceModelProvider {
  readonly initialization = openAIApiKeyProviderInitialization;
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
