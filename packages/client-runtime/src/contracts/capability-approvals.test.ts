import { describe, expect, it } from "vite-plus/test";
import { capabilityChangeApprovalFromPart } from "./capability-approvals.js";

const proposal = {
  id: "proposal-1",
  title: "Add Stripe",
  rationale: "Read revenue",
  category: "connector",
  preview: {
    permissions: [],
    credentials: [],
    cost_summary: "$0",
    security_summary: "Read-only",
    rollback_plan: "Remove",
  },
  approval: {
    approval_id: "approval-1",
    proposal_id: "proposal-1",
    proposal_hash: "hash-1",
    proposal_generation: 1,
    status: "pending",
    title: "Add Stripe",
    instructions: "Read revenue",
  },
};

describe("capabilityChangeApprovalFromPart", () => {
  it("accepts the SDK proposal tool's direct tokenless output", () => {
    const approval = capabilityChangeApprovalFromPart({
      type: "tool",
      tool_name: "propose_self_extension",
      output: proposal,
    });
    expect(approval?.approval).toMatchObject({
      approval_id: "approval-1",
      proposal_hash: "hash-1",
    });
    expect(JSON.stringify(approval)).not.toContain("token");
  });

  it("accepts wrapped output and rejects unrelated tools", () => {
    expect(
      capabilityChangeApprovalFromPart({
        type: "tool-propose_capability_change",
        output: { capability_change_approval: proposal },
      })?.id,
    ).toBe("proposal-1");
    expect(
      capabilityChangeApprovalFromPart({ type: "tool", tool_name: "bash", output: proposal }),
    ).toBeUndefined();
  });
});
