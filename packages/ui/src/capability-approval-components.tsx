import { useState } from "react";
import type { CapabilityChangeApproval } from "@tryopenbot/client-runtime";

export interface CapabilityApprovalCardProps {
  approval: CapabilityChangeApproval;
  onDecision?: (decision: "approve" | "reject") => Promise<void>;
}

/** Render a server-authored capability change with exact human Yes/No actions. */
export function CapabilityApprovalCard({ approval, onDecision }: CapabilityApprovalCardProps) {
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState<"approve" | "reject">();
  const [error, setError] = useState("");
  const pending = approval.approval.status === "pending" && !answered;

  const decide = async (decision: "approve" | "reject"): Promise<void> => {
    if (!onDecision || busy) return;
    setBusy(true);
    setError("");
    try {
      await onDecision(decision);
      setAnswered(decision);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="capability-approval-card" aria-label="Capability change approval">
      <div className="capability-approval-copy">
        <small>{approval.category.replaceAll("_", " ")}</small>
        <strong>{approval.title}</strong>
        <p>{approval.rationale}</p>
        <dl>
          <div>
            <dt>Cost</dt>
            <dd>{approval.preview.cost_summary}</dd>
          </div>
          <div>
            <dt>Security</dt>
            <dd>{approval.preview.security_summary}</dd>
          </div>
          <div>
            <dt>Undo</dt>
            <dd>{approval.preview.rollback_plan}</dd>
          </div>
        </dl>
        {error ? (
          <p className="capability-approval-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="capability-approval-actions">
        {pending ? (
          <>
            <button
              disabled={busy || !onDecision}
              onClick={() => void decide("reject")}
              type="button"
            >
              No
            </button>
            <button
              className="primary"
              disabled={busy || !onDecision}
              onClick={() => void decide("approve")}
              type="button"
            >
              Yes
            </button>
          </>
        ) : (
          <span>
            {answered === "approve" || approval.approval.status === "completed"
              ? "Approved"
              : "Declined"}
          </span>
        )}
      </div>
    </section>
  );
}
