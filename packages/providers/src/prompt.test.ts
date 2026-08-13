import type { PromptPlugin, SandboxProvider } from "@openbot/provider-sdk";
import { describe, expect, it } from "vite-plus/test";
import { OpenBotPromptProvider } from "./prompt.js";

const request = {
  agent: { id: "agent-one", displayName: "Scout" },
  sessionId: "session-one",
  capabilities: { runtimeMcp: true, skillRegistry: true, memory: false },
  skills: [
    {
      id: "skill-one",
      name: "web-investigation",
      description: "Research a question with cited sources.",
      version: 1,
    },
  ],
};

describe("OpenBotPromptProvider", () => {
  it("assembles deterministic ordered sections and capability summaries", async () => {
    const plugin: PromptPlugin = {
      id: "installation",
      contribute: () => ({
        id: "installation",
        priority: 500,
        cache: "session",
        content: "Installation rule.",
      }),
    };
    const provider = new OpenBotPromptProvider({ plugins: [plugin] });
    const first = await provider.compose(request, { requestId: "one" });
    const second = await provider.compose(request, { requestId: "two" });
    expect(first.system).toContain("You are Scout");
    expect(first.system).toContain("web-investigation");
    expect(first.system).toContain("Installation rule.");
    expect(first.sections.map((section) => section.id)).toEqual([
      "identity",
      "work-policy",
      "tilde-runtime",
      "skill-catalog",
      "installation",
      "turn-context",
    ]);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("rejects duplicate plugin section ids", async () => {
    const provider = new OpenBotPromptProvider({
      plugins: [
        {
          id: "duplicate",
          contribute: () => ({ id: "identity", priority: 1, cache: "stable", content: "bad" }),
        },
      ],
    });
    await expect(provider.compose(request, { requestId: "one" })).rejects.toMatchObject({
      code: "invalid_configuration",
    });
  });

  it("uses the currently selected provider's injected instructions", async () => {
    const sandbox = (id: string, content: string) =>
      ({
        descriptor: { id, version: "1.0.0", displayName: id, kind: "sandbox", capabilities: [] },
        health: async () => ({ healthy: true }),
        injectSystemPrompt: () => content,
      }) as unknown as SandboxProvider;
    const local = await new OpenBotPromptProvider({
      providers: { sandbox: sandbox("local-box", "Use the local computer.") },
    }).compose(request, { requestId: "local" });
    const remote = await new OpenBotPromptProvider({
      providers: { sandbox: sandbox("remote-box", "Use the remote resumable computer.") },
    }).compose(request, { requestId: "remote" });
    expect(local.system).toContain("Use the local computer.");
    expect(remote.system).toContain("Use the remote resumable computer.");
    expect(local.sections.map((section) => section.id)).toContain(
      "provider.sandbox-provider.local-box",
    );
    expect(remote.sections.map((section) => section.id)).toContain(
      "provider.sandbox-provider.remote-box",
    );
    expect(local.fingerprint).not.toBe(remote.fingerprint);
  });
});
