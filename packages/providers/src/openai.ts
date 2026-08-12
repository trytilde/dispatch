import { createOpenAI } from "@ai-sdk/openai";
import type { AiCredential, AiProvider, ProviderCallContext } from "@openbot/provider-sdk";
import { ProviderError } from "@openbot/provider-sdk";

export class OpenAiProvider implements AiProvider {
  readonly descriptor = {
    id: "openai",
    version: "1.0.0",
    displayName: "OpenAI",
    kind: "ai" as const,
    capabilities: ["responses", "streaming", "tools", "api-key", "oauth-contract"] as const,
  };

  async health(_context: ProviderCallContext) {
    return { healthy: true };
  }

  async validateCredential(credential: AiCredential, _context: ProviderCallContext): Promise<void> {
    if (credential.mode === "oauth") {
      throw new ProviderError(
        "not_supported",
        "OpenAI OAuth is a declared credential mode but is not implemented in this milestone",
      );
    }
    if (!credential.apiKey.startsWith("sk-") || credential.apiKey.length < 20) {
      throw new ProviderError("invalid_configuration", "OpenAI API key is not valid");
    }
  }

  injectSystemPrompt() {
    return [
      "OpenAI model runtime:",
      "- Use native tool calls when a provided tool can materially advance the task; never describe a tool call as if it already happened.",
      "- Keep tool arguments minimal and schema-valid. Use tool results as evidence, and do not expose hidden reasoning or provider credentials.",
    ].join("\n");
  }

  languageModel(modelId: string, credential: AiCredential) {
    if (credential.mode !== "api_key") {
      throw new ProviderError("not_supported", "OpenAI OAuth cannot fall back to API-key inference");
    }
    return createOpenAI({ apiKey: credential.apiKey }).responses(modelId);
  }
}
