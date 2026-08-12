import type { LanguageModelV3 } from "@ai-sdk/provider";
import { describe, expectTypeOf, it } from "vitest";
import type { InferenceModelProvider } from "./index.js";

describe("InferenceModelProvider", () => {
  it("returns an AI SDK language model selected at runtime", () => {
    expectTypeOf<InferenceModelProvider["model"]>().returns.toEqualTypeOf<LanguageModelV3>();
  });
});
