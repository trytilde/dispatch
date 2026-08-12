import { describe, expect, it, vi } from "vitest";
import {
  openAIChatGPTAccountId,
  OpenAIApiKeyInferenceModelProvider,
  OpenAIOAuthInferenceModelProvider,
} from "./index.js";

describe("OpenAI inference model providers", () => {
  it("selects the API-key model at call time", () => {
    const provider = new OpenAIApiKeyInferenceModelProvider({ apiKey: "sk-test-not-a-real-key" });
    expect(provider.model(" gpt-test ").modelId).toBe("gpt-test");
    expect(provider.injectPromptPart()).toContain("OpenAI model runtime");
  });

  it("rejects an empty runtime model name", () => {
    const provider = new OpenAIApiKeyInferenceModelProvider({ apiKey: "sk-test-not-a-real-key" });
    expect(() => provider.model(" ")).toThrow("Inference model name is required");
  });

  it("extracts the ChatGPT account ID from an OAuth token", () => {
    const token = jwt({
      "https://api.openai.com/auth": { chatgpt_account_id: "account-123" },
    });
    expect(openAIChatGPTAccountId(token)).toBe("account-123");
  });

  it("resolves fresh OAuth credentials for each request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      id: "response-1",
      created_at: 1,
      model: "gpt-test",
      object: "response",
      output: [{
        id: "message-1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "done", annotations: [], logprobs: [] }],
      }],
      parallel_tool_calls: false,
      status: "completed",
      text: { format: { type: "text" } },
      tool_choice: "auto",
      tools: [],
      usage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 2,
      },
    }));
    const credential = vi.fn().mockResolvedValue({
      accessToken: jwt({ "https://api.openai.com/auth": { chatgpt_account_id: "account-123" } }),
    });
    const provider = new OpenAIOAuthInferenceModelProvider({ credential, fetch });

    await provider.model("gpt-test").doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });

    expect(credential).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://chatgpt.com/backend-api/codex/responses");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toMatch(/^Bearer /);
    expect(headers.get("chatgpt-account-id")).toBe("account-123");
    expect(headers.get("originator")).toBe("openbot");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-test", store: false });
  });
});

function jwt(payload: Record<string, unknown>): string {
  return ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(".");
}
