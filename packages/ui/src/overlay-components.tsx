import { type ReactNode, useEffect, useId, useRef, useState } from "react";

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
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setClosing(false);
      return;
    }
    if (!present) return;
    setClosing(true);
    const timeout = window.setTimeout(() => {
      setPresent(false);
      setClosing(false);
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [open, present]);

  useDialogKeyboard(open, onClose);
  useEffect(() => {
    if (!open) return;
    surfaceRef.current?.focus();
  }, [open]);

  if (!present) return null;
  return (
    <div
      className="dialog-layer ob-dialog-backdrop"
      data-state={closing ? "closing" : "open"}
      onMouseDown={(event) => {
        if (open && event.target === event.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`dialog-surface ob-dialog ${className}`.trim()}
        data-state={closing ? "closing" : "open"}
        ref={surfaceRef}
        role="dialog"
        style={{ width }}
        tabIndex={-1}
      >
        <header className="dialog-header ob-dialog-header">
          <h2 className="ob-dialog-title" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p className="ob-dialog-description" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </header>
        {children ? <div className="dialog-body">{children}</div> : null}
        {actions ? <footer className="dialog-actions ob-dialog-footer">{actions}</footer> : null}
      </div>
    </div>
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
