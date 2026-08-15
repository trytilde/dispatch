import { type ReactNode, useEffect, useId, useRef } from "react";

export interface DialogSurfaceProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  width?: number;
  className?: string;
}

export function DialogSurface({
  open,
  title,
  description,
  children,
  actions,
  onClose,
  width = 440,
  className = "",
}: DialogSurfaceProps) {
  const titleId = useId();
  const descriptionId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);

  useDialogKeyboard(open, onClose);
  useEffect(() => {
    if (!open) return;
    surfaceRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="dialog-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`dialog-surface ${className}`.trim()}
        ref={surfaceRef}
        role="dialog"
        style={{ width }}
        tabIndex={-1}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </header>
        {children ? <div className="dialog-body">{children}</div> : null}
        {actions ? <footer className="dialog-actions">{actions}</footer> : null}
      </div>
    </div>
  );
}

export interface PermissionAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

export interface PermissionRequestCardProps {
  title: string;
  description: string;
  actions: readonly PermissionAction[];
  badge?: ReactNode;
  failureNote?: string;
  onDismiss?: () => void;
}

export function PermissionRequestCard({
  title,
  description,
  actions,
  badge = "!",
  failureNote,
  onDismiss,
}: PermissionRequestCardProps) {
  return (
    <section aria-label={title} className="permission-card">
      <span aria-hidden="true" className="permission-card-badge">
        {badge}
      </span>
      <span className="permission-card-copy">
        <strong>{title}</strong>
        <small>{description}</small>
        {failureNote ? <em role="alert">{failureNote}</em> : null}
      </span>
      <span className="permission-card-actions">
        {actions.map((action) => (
          <button
            className={action.primary ? "primary" : ""}
            disabled={action.disabled}
            key={action.label}
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </span>
      {onDismiss ? (
        <button
          aria-label="Dismiss permission request"
          className="permission-card-dismiss"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      ) : null}
    </section>
  );
}

export interface ThreadOverlayProps {
  open: boolean;
  children: ReactNode;
  footer?: ReactNode;
  label?: string;
  loadFailed?: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

export function ThreadOverlay({
  open,
  children,
  footer,
  label = "Agent exchange",
  loadFailed = false,
  onClose,
  onRetry,
}: ThreadOverlayProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(open, onClose);

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <section aria-label={label} className="thread-overlay" role="dialog">
      <button
        aria-label="Close agent exchange"
        className="thread-overlay-scrim"
        onClick={onClose}
        type="button"
      />
      <div className="thread-overlay-sheet" ref={sheetRef} tabIndex={-1}>
        <div aria-live="off" className="thread-overlay-messages" role="log">
          {loadFailed ? (
            <div className="thread-overlay-load-failed" role="alert">
              <p>Couldn&apos;t load this conversation. Check your connection and try again.</p>
              {onRetry ? (
                <button onClick={onRetry} type="button">
                  Retry
                </button>
              ) : null}
            </div>
          ) : (
            children
          )}
        </div>
        <div aria-hidden="true" className="thread-overlay-fade thread-overlay-fade-top" />
        <div aria-hidden="true" className="thread-overlay-fade thread-overlay-fade-bottom" />
        {footer ? <footer className="thread-overlay-footer">{footer}</footer> : null}
      </div>
    </section>
  );
}

function useDialogKeyboard(open: boolean, onClose?: () => void): void {
  useEffect(() => {
    if (!open || !onClose) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.repeat || event.isComposing)
        return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose, open]);
}
