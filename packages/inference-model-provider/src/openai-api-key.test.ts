import { describe, expect, it } from "vitest";
import { OpenAIApiKeyInferenceModelProvider } from "./openai-api-key.js";

describe("OpenAIApiKeyInferenceModelProvider", () => {
  it("selects the API-key model at call time", () => {
    const provider = new OpenAIApiKeyInferenceModelProvider({ apiKey: "sk-test-not-a-real-key" });
    expect(provider.model(" gpt-test ").modelId).toBe("gpt-test");
    expect(provider.injectPromptPart()).toContain("OpenAI model runtime");
  });

  it("rejects an empty runtime model name", () => {
    const provider = new OpenAIApiKeyInferenceModelProvider({ apiKey: "sk-test-not-a-real-key" });
    expect(() => provider.model(" ")).toThrow("Inference model name is required");
  });
});
