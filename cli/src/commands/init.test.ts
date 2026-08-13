import { describe, expect, it } from "vite-plus/test";
import { createNonInteractivePrompts, validateNonInteractiveCoreAnswers } from "./init.js";

describe("non-interactive initialization prompts", () => {
  it("answers stable input and selection IDs", async () => {
    const prompts = createNonInteractivePrompts({
      "repository-name": "agent-openbot",
      "repository-visibility": "private",
    });

    await expect(
      prompts.input("GitHub repository name", { id: "repository-name", required: true }),
    ).resolves.toBe("agent-openbot");
    await expect(
      prompts.select(
        "GitHub repository visibility",
        [
          { value: "private", label: "Private" },
          { value: "public", label: "Public" },
        ],
        { id: "repository-visibility" },
      ),
    ).resolves.toBe("private");
  });

  it("reports a missing answer by stable ID", async () => {
    const prompts = createNonInteractivePrompts({});
    await expect(
      prompts.input("AWS KMS key ARN", { id: "aws-kms-key-arn", required: true }),
    ).rejects.toThrow("Missing non-interactive answer: aws-kms-key-arn");
  });

  it("rejects invalid select values with allowed values", async () => {
    const prompts = createNonInteractivePrompts({ runtime: "cloud" });
    await expect(
      prompts.select(
        "Runtime",
        [
          { value: "local", label: "Local" },
          { value: "vercel", label: "Vercel" },
        ],
        { id: "runtime" },
      ),
    ).rejects.toThrow("expected one of local, vercel");
  });

  it("validates all Vercel inputs before repository bootstrap can mutate", () => {
    expect(() =>
      validateNonInteractiveCoreAnswers({
        "repository-name": "agent-openbot",
        "repository-visibility": "private",
        "owner-identity": "aws-kms",
        "aws-kms-key-arn": "arn:aws:kms:us-east-1:123:key/test",
        "aws-profile": "admin",
        runtime: "vercel",
      }),
    ).toThrow("Missing required non-interactive answer: vercel-token");
  });
});
