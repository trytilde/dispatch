import { describe, expect, it } from "vitest";
import { OpenAiProvider } from "./openai.js";

describe("OpenAiProvider", () => {
  const context = { requestId: "test" };

  it("does not silently use an API path for OAuth", async () => {
    const provider = new OpenAiProvider();
    await expect(provider.validateCredential({ mode: "oauth", accessToken: "token" }, context)).rejects.toMatchObject({ code: "not_supported" });
  });

  it("rejects malformed API keys", async () => {
    const provider = new OpenAiProvider();
    await expect(provider.validateCredential({ mode: "api_key", apiKey: "bad" }, context)).rejects.toMatchObject({ code: "invalid_configuration" });
  });
});
