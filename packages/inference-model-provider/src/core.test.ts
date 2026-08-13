import type { LanguageModelV3 } from "@ai-sdk/provider";
import { describe, expectTypeOf, it } from "vite-plus/test";
import type { InferenceModelProvider } from "./core.js";

describe("InferenceModelProvider", () => {
  it("returns an AI SDK language model selected at runtime", () => {
    expectTypeOf<InferenceModelProvider["model"]>().returns.toEqualTypeOf<LanguageModelV3>();
  });
});
