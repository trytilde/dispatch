import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useState } from "react";
import { ComputerStagePlaceholder } from "./computer-stage.js";
import { type ComputerMonitor, ComputerMonitorStrip } from "./computer-components.js";

export interface AgentWorkspacePanelProps {
  agentId: string;
  agentName: string;
  activityCount: number;
  activity: ReactNode;
  open: boolean;
  onClose: () => void;
  onResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  monitors?: readonly ComputerMonitor[];
  onSelectMonitor?: (monitorId: string) => void;
}

export function AgentWorkspacePanel({
  agentId,
  agentName,
  activityCount,
  activity,
  open,
  onClose,
  onResize,
  monitors = [],
  onSelectMonitor,
}: AgentWorkspacePanelProps) {
  const [view, setView] = useState<"computer" | "activity">("computer");
  const [controlling, setControlling] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setControlling(false);
    setPreviewReady(false);
    setPreviewFailed(false);
    setPreviewKey((value) => value + 1);
  }, [agentId]);

  useEffect(() => {
    if (!fullscreen) return;
    const exitFullscreen = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", exitFullscreen);
    return () => window.removeEventListener("keydown", exitFullscreen);
  }, [fullscreen]);

  return (
    <section
      aria-hidden={!open && !fullscreen}
      className={`work-pane agent-workspace-pane ${open ? "open" : "closed"} ${fullscreen ? "fullscreen" : ""}`}
      inert={!open && !fullscreen}
    >
      <div
        aria-label="Resize Computer pane"
        className="workspace-resize-handle"
        onPointerDown={onResize}
        role="separator"
      />
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
                setPreviewFailed(false);
                setPreviewKey((value) => value + 1);
              }}
            >
              ↻
            </button>
            <button
              aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
              onClick={() => setFullscreen((value) => !value)}
              title={fullscreen ? "Exit full screen" : "Enter full screen"}
            >
              {fullscreen ? "↙" : "↗"}
            </button>
            <button
              className={controlling ? "active" : "take-over"}
              onClick={() => setControlling((value) => !value)}
            >
              {controlling ? "Release" : "Take over"}
            </button>
            <button
              aria-label="Close Computer pane"
              onClick={() => {
                setFullscreen(false);
                onClose();
              }}
              title="Close Computer pane"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="computer-actions">
            <button aria-label="Close Computer pane" onClick={onClose} title="Close Computer pane">
              ×
            </button>
          </div>
        )}
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
            onError={() => {
              setPreviewReady(false);
              setPreviewFailed(true);
            }}
            onLoad={() => {
              setPreviewFailed(false);
              setPreviewReady(true);
            }}
          />
          {!previewReady || previewFailed ? (
            <ComputerStagePlaceholder
              busy={!previewFailed}
              message={
                previewFailed ? `Can't reach ${agentName}'s screen` : "Booting up the computer"
              }
              onRetry={
                previewFailed
                  ? () => {
                      setPreviewFailed(false);
                      setPreviewReady(false);
                      setPreviewKey((value) => value + 1);
                    }
                  : undefined
              }
            />
          ) : null}
          {!controlling && previewReady ? (
            <button className="computer-shield" onClick={() => setControlling(true)}>
              <span>Computer preview</span>
              <strong>Click to take over</strong>
            </button>
          ) : null}
          {previewReady && onSelectMonitor ? (
            <ComputerMonitorStrip
              activeMonitorId={agentId}
              monitors={monitors}
              onSelect={onSelectMonitor}
            />
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
