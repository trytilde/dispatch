import type { MemorySynthesisSessionClient } from "@trytilde/sdk";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  createMemorySynthesisTools,
  restrictMemorySynthesisTools,
} from "../src/memory-synthesis-tools";

describe("createMemorySynthesisTools", () => {
  it("keeps only bound mutations and read-only skill discovery", () => {
    const executable = { execute: vi.fn() } as never;
    const bound = { memory_upsert: executable, finish_synthesis: executable };
    expect(
      Object.keys(
        restrictMemorySynthesisTools(
          {
            ...bound,
            search_skills: executable,
            read_skill: executable,
            sendMessage: executable,
            MULTI_EXECUTE_TOOL: executable,
            memory_unbound_query: executable,
            tilde_modify_resource: executable,
          },
          bound,
        ),
      ).toSorted(),
    ).toEqual(["finish_synthesis", "memory_upsert", "read_skill", "search_skills"]);
  });

  it("exposes bank-free tools backed by one synthesis session client", async () => {
    const finish = vi.fn(async () => ({ ok: true }));
    const memory = {
      recall: vi.fn(),
      upsert: vi.fn(),
      forget: vi.fn(),
      finish,
    } as unknown as MemorySynthesisSessionClient;
    const tools = createMemorySynthesisTools(memory);

    expect(Object.keys(tools)).toEqual([
      "memory_recall",
      "memory_upsert",
      "memory_supersede",
      "finish_synthesis",
    ]);
    expect(JSON.stringify(tools)).not.toContain("bank_id");

    const execute = tools.finish_synthesis?.execute as
      | ((input: Record<string, unknown>, options: never) => Promise<unknown>)
      | undefined;
    await execute?.(
      {
        batch_id: "batch-one",
        evidence_ids: ["event-one"],
        outcome: "noop",
        reason: "duplicate evidence",
      },
      { toolCallId: "call-one", messages: [], context: undefined } as never,
    );
    expect(finish).toHaveBeenCalledWith({
      batchId: "batch-one",
      evidenceIds: ["event-one"],
      outcome: "noop",
      reason: "duplicate evidence",
    });
  });
});
