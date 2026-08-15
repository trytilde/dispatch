import type { ReactNode } from "react";
import { DialogSurface } from "./overlay-components.js";

export interface ComputerMonitor {
  id: string;
  title: string;
  previewUrl: string;
  needsAttention?: boolean;
}

export interface ComputerMonitorStripProps {
  monitors: readonly ComputerMonitor[];
  activeMonitorId?: string;
  onSelect: (monitorId: string) => void;
}

export type ComputerReconnectVariant = "checking" | "network" | "restarting";

export interface ComputerReconnectBannerProps {
  variant?: ComputerReconnectVariant | null;
  computerName?: string;
}

export function ComputerReconnectBanner({
  variant,
  computerName = "OpenBot's Computer",
}: ComputerReconnectBannerProps) {
  if (!variant) return null;
  const copy =
    variant === "checking"
      ? { title: "Checking connection", subtitle: "Reconnecting" }
      : variant === "network"
        ? { title: "Reconnecting" }
        : { title: `${computerName} restarting`, subtitle: `Starting ${computerName}` };
  return (
    <div className="computer-reconnect-banner-layer">
      <div
        aria-label={copy.title}
        aria-live="polite"
        className="computer-progress-banner"
        data-variant={variant}
        role="status"
      >
        <span aria-hidden="true" className="computer-progress-spinner" />
        <span>
          <strong>{copy.title}</strong>
          {copy.subtitle ? <small>{copy.subtitle}</small> : null}
        </span>
      </div>
    </div>
  );
}

export interface ComputerLifecycleDialogProps {
  open: boolean;
  title: string;
  description: string;
  actions: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function ComputerLifecycleDialog({
  open,
  title,
  description,
  actions,
  onDismiss,
  className = "",
}: ComputerLifecycleDialogProps) {
  return (
    <DialogSurface
      actions={actions}
      className={`computer-lifecycle-dialog ${className}`.trim()}
      description={description}
      onClose={onDismiss}
      open={open}
      title={title}
      width={440}
    />
  );
}

export interface ComputerUnreachableDialogProps {
  open: boolean;
  canRecover: boolean;
  computerName?: string;
  onRecover: () => void;
  onRetry: () => void;
}

export function ComputerUnreachableDialog({
  open,
  canRecover,
  computerName = "OpenBot's Computer",
  onRecover,
  onRetry,
}: ComputerUnreachableDialogProps) {
  return (
    <ComputerLifecycleDialog
      actions={
        <>
          <button disabled={!canRecover} onClick={onRecover} type="button">
            Recover {computerName}
          </button>
          <button className="primary" onClick={onRetry} type="button">
            Retry
          </button>
        </>
      }
      className="computer-unreachable-dialog"
      description={`Your agents, files, and logins are safe. If it doesn't reconnect on its own, recover ${computerName} to keep the data.`}
      open={open}
      title={`Couldn't Reach ${computerName}`}
    />
  );
}

export interface ComputerRecoveryConfirmDialogProps {
  open: boolean;
  canRecover: boolean;
  computerName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ComputerRecoveryConfirmDialog({
  open,
  canRecover,
  computerName = "OpenBot's Computer",
  onCancel,
  onConfirm,
}: ComputerRecoveryConfirmDialogProps) {
  return (
    <ComputerLifecycleDialog
      actions={
        <>
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="primary" disabled={!canRecover} onClick={onConfirm} type="button">
            Recover {computerName}
          </button>
        </>
      }
      className="computer-recovery-confirm-dialog"
      description={`This recreates ${computerName} and reconnects. Your agents, files, and logins are kept.`}
      onDismiss={onCancel}
      open={open}
      title={`Recover ${computerName}?`}
    />
  );
}

export type ComputerOperationKind = "update" | "reset" | "recover";

export interface ComputerTakingLongerDialogProps {
  open: boolean;
  kind: ComputerOperationKind;
  onContinueInBackground: () => void;
  onKeepWaiting: () => void;
}

const operationPhrases: Record<ComputerOperationKind, string> = {
  update: "The update is still running — a large image download can take a few minutes.",
  reset: "The reset is still running — rebuilding the Computer can take a few minutes.",
  recover: "The recovery is still running — recreating the Computer can take a few minutes.",
};

export function ComputerTakingLongerDialog({
  open,
  kind,
  onContinueInBackground,
  onKeepWaiting,
}: ComputerTakingLongerDialogProps) {
  return (
    <ComputerLifecycleDialog
      actions={
        <>
          <button onClick={onKeepWaiting} type="button">
            Keep waiting
          </button>
          <button className="primary" onClick={onContinueInBackground} type="button">
            Continue in Background
          </button>
        </>
      }
      className="computer-taking-longer-dialog"
      description={`${operationPhrases[kind]} You can keep waiting, or continue in the background.`}
      onDismiss={onKeepWaiting}
      open={open}
      title="Taking longer than expected"
    />
  );
}

const visibleMonitorLimit = 3;

export function ComputerMonitorStrip({
  monitors,
  activeMonitorId,
  onSelect,
}: ComputerMonitorStripProps) {
  if (monitors.length < 2) return null;
  const hasOverflow = monitors.length > visibleMonitorLimit + 1;
  const visible = hasOverflow ? monitors.slice(0, visibleMonitorLimit) : monitors;
  const overflow = hasOverflow ? monitors.slice(visibleMonitorLimit) : [];
  return (
    <div aria-label="Computer screens" className="computer-monitor-strip" role="group">
      {visible.map((monitor) => (
        <ComputerMonitorButton
          active={monitor.id === activeMonitorId}
          key={monitor.id}
          monitor={monitor}
          onSelect={onSelect}
        />
      ))}
      {overflow.length ? (
        <details className="computer-monitor-more">
          <summary aria-label={`Show ${overflow.length} more screens`}>
            <span className="computer-monitor-more-preview">⌑</span>
            <span>and {overflow.length} more</span>
          </summary>
          <div aria-label="More screens" role="menu">
            {overflow.map((monitor) => (
              <button key={monitor.id} onClick={() => onSelect(monitor.id)} role="menuitem">
                {monitor.title}
                {monitor.needsAttention ? <i aria-label="Needs attention" /> : null}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ComputerMonitorButton({
  monitor,
  active,
  onSelect,
}: {
  monitor: ComputerMonitor;
  active: boolean;
  onSelect: (monitorId: string) => void;
}) {
  const label = monitor.needsAttention
    ? `${monitor.title} — needs you`
    : `Switch to ${monitor.title}`;
  return (
    <button
      aria-current={active}
      aria-label={label}
      className="computer-monitor-thumb"
      onClick={() => onSelect(monitor.id)}
      title={label}
      type="button"
    >
      <span className="computer-monitor-preview">
        <iframe aria-hidden="true" src={monitor.previewUrl} tabIndex={-1} title="" />
        <span aria-hidden="true" />
      </span>
      <span className="computer-monitor-caption">
        {monitor.needsAttention ? <i aria-hidden="true" /> : null}
        <span>{monitor.title}</span>
      </span>
    </button>
  );
}
