import { describe, expect, it } from "vite-plus/test";
import { ProviderError } from "./index.js";

describe("ProviderError", () => {
  it("preserves structured provider failure details", () => {
    const error = new ProviderError("provider_unavailable", "offline", true);
    expect(error.name).toBe("ProviderError");
    expect(error.code).toBe("provider_unavailable");
    expect(error.retryable).toBe(true);
  });
});
