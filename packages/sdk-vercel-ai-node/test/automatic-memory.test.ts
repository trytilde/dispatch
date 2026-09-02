import { describe, expect, it, vi } from "vite-plus/test";
import { createChatKitAutomaticMemoryController } from "../src/automatic-memory";

describe("automatic memory inference controller", () => {
  it("returns no dynamic message when memory is disabled", async () => {
    const recallAutomaticMemory = vi.fn(async () => ({
      items: [],
      rendered: "",
      estimatedTokens: 0,
      truncated: false,
    }));
    const controller = createChatKitAutomaticMemoryController({
      session: { recallAutomaticMemory } as never,
    });

    await expect(controller.recall({ messageId: "message-one" })).resolves.toEqual({
      projection: {
        items: [],
        rendered: "",
        estimatedTokens: 0,
        truncated: false,
      },
    });
  });

  it("creates a byte-stable provenance system suffix", async () => {
    const projection = {
      items: [],
      rendered: '{"memory_context":[{"bank_id":"bank-one","memory_id":"memory-one"}]}',
      estimatedTokens: 18,
      truncated: false,
    };
    const controller = createChatKitAutomaticMemoryController({
      session: {
        recallAutomaticMemory: vi.fn(async () => projection),
      } as never,
    });

    const first = await controller.recall({ messageId: "message-one" });
    const repeated = await controller.recall({ messageId: "message-one" });
    expect(first.message).toEqual(repeated.message);
    expect(first.message).toEqual({
      role: "system",
      content: expect.stringContaining(projection.rendered),
    });
  });
});
