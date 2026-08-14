import { VercelPlatform } from "@tryopenbot/platform-integrations";
import { describe, expect, it, vi } from "vite-plus/test";
import { VercelInferenceProvider } from "./vercel.js";

describe("VercelInferenceProvider", () => {
  it("provisions and persists the canonical AI Gateway secret", async () => {
    const request = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      Response.json({ apiKey: { id: "key_123" }, apiKeyString: "gateway-private" }),
    );
    const provider = new VercelInferenceProvider(new VercelPlatform({ request }));
    const setEnvironment = vi.fn(async () => undefined);
    const setSecret = vi.fn(async () => undefined);
    await provider.initialize({
      repositoryRoot: "/repository",
      environment: {
        VERCEL_TOKEN: "vercel-private",
        VERCEL_TEAM_ID: "team_123",
        VERCEL_AI_GATEWAY_API_KEY_NAME: "OpenBot agents",
      },
      setEnvironment,
      setSecret,
    });
    expect(setEnvironment).toHaveBeenCalledWith(
      "OPENAI_BASE_URL",
      "https://ai-gateway.vercel.sh/v1",
      "OpenAI-compatible endpoint provided by Vercel AI Gateway.",
    );
    expect(setSecret).toHaveBeenCalledWith(
      "AI_GATEWAY_API_KEY",
      "gateway-private",
      "Vercel AI Gateway API key used by authored agents.",
    );
  });

  it("does not create another key when one is already configured", async () => {
    const request = vi.fn();
    const provider = new VercelInferenceProvider(new VercelPlatform({ request }));
    const setEnvironment = vi.fn(async () => undefined);
    await provider.initialize({
      repositoryRoot: "/repository",
      environment: { AI_GATEWAY_API_KEY: "existing" },
      setEnvironment,
      setSecret: vi.fn(async () => undefined),
    });
    expect(setEnvironment).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
});
