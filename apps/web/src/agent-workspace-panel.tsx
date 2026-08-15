import { type ReactNode, useEffect, useState } from "react";

interface AgentWorkspacePanelProps {
  agentId: string;
  agentName: string;
  activityCount: number;
  activity: ReactNode;
}

export function AgentWorkspacePanel({
  agentId,
  agentName,
  activityCount,
  activity,
}: AgentWorkspacePanelProps) {
  const [view, setView] = useState<"computer" | "activity">("computer");
  const [controlling, setControlling] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    setControlling(false);
    setPreviewReady(false);
    setPreviewKey((value) => value + 1);
  }, [agentId]);

  return (
    <section className="work-pane agent-workspace-pane">
      <header className="workspace-tabs">
        <div>
          <button
            className={view === "computer" ? "active" : ""}
            onClick={() => setView("computer")}
          >
            Computer
          </button>
          <button
            className={view === "activity" ? "active" : ""}
            onClick={() => setView("activity")}
          >
            Activity
            {activityCount > 0 ? <span>{activityCount}</span> : null}
          </button>
        </div>
        {view === "computer" && agentId ? (
          <div className="computer-actions">
            <button
              aria-label="Reload computer preview"
              title="Reload computer preview"
              onClick={() => {
                setPreviewReady(false);
                setPreviewKey((value) => value + 1);
              }}
            >
              ↻
            </button>
            <button
              className={controlling ? "active" : "take-over"}
              onClick={() => setControlling((value) => !value)}
            >
              {controlling ? "Release" : "Take over"}
            </button>
          </div>
        ) : null}
      </header>

      {view === "activity" ? (
        <div className="activity-surface">{activity}</div>
      ) : agentId ? (
        <div className={controlling ? "computer-surface controlling" : "computer-surface"}>
          <div className="computer-status">
            <span className={previewReady ? "ready" : ""} />
            <strong>{agentName}</strong>
            <small>{previewReady ? "Preview loaded" : "Connecting to Computer…"}</small>
          </div>
          <iframe
            key={`${agentId}-${previewKey}`}
            src={`/api/computer/${encodeURIComponent(agentId)}/preview`}
            title={`${agentName} Computer`}
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
            onLoad={() => setPreviewReady(true)}
          />
          {!controlling ? (
            <button className="computer-shield" onClick={() => setControlling(true)}>
              <span>Computer preview</span>
              <strong>Click to take over</strong>
            </button>
          ) : null}
        </div>
      ) : (
        <div className="computer-empty">
          <span>⌁</span>
          <h3>No agent selected</h3>
          <p>Select an agent to open its Computer.</p>
        </div>
      )}
    </section>
  );
}
