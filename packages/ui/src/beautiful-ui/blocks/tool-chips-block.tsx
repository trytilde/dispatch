"use client";

import { useState, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS BLOCK
 * Data-driven fork of the Beautiful UI "Tool Chips"
 * primitive (beautifului.dev, MIT): an agent run as compact
 * rows — tool label plus an inline chip, hover swaps the
 * icon for a chevron, every row expands to show what the
 * tool actually did.
 * ───────────────────────────────────────────────────────── */

export type ToolChipIcon = "think" | "write" | "run" | "read" | "tool";

const Icons: Record<ToolChipIcon, ReactNode> = {
  think: <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  write: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </g>
  ),
  run: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 17l6-5-6-5M12 19h8" />
    </g>
  ),
  read: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </g>
  ),
  tool: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </g>
  ),
};

export interface ToolChipDetailLine {
  text: string;
  tone?: "add" | "del" | "error";
}

export interface ToolChipRow {
  id: string;
  icon?: ToolChipIcon;
  label: string;
  chip?: string;
  mono?: boolean;
  detailMono?: boolean;
  detail?: readonly ToolChipDetailLine[];
  pending?: boolean;
  failed?: boolean;
}

export interface ToolChipsBlockProps {
  headerLabel?: string;
  rows: readonly ToolChipRow[];
  defaultOpen?: boolean;
  className?: string;
}

export function ToolChipsBlock({
  headerLabel,
  rows,
  defaultOpen = true,
  className,
}: ToolChipsBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());

  const toggleRow = (id: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={`tool-pattern ${className ?? ""}`}>
      {headerLabel ? (
        <button
          type="button"
          className="tool-pattern-heading"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            style={{ transform: open ? undefined : "rotate(-90deg)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span>{headerLabel}</span>
        </button>
      ) : null}
      {!headerLabel || open ? (
        <div className="tool-pattern-rows">
          {rows.map((row) => {
            const rowOpen = openRows.has(row.id);
            const expandable = Boolean(row.detail?.length);
            const Row = expandable ? "button" : "div";
            return (
              <div
                className="tool-pattern-item"
                key={row.id}
                data-state={row.failed ? "failed" : row.pending ? "pending" : "ready"}
              >
                <Row
                  className="tool-pattern-row"
                  type={expandable ? "button" : undefined}
                  aria-label={
                    expandable
                      ? rowOpen
                        ? "Collapse tool details"
                        : "Expand tool details"
                      : undefined
                  }
                  aria-expanded={expandable ? rowOpen : undefined}
                  onClick={expandable ? () => toggleRow(row.id) : undefined}
                >
                  <span className="tool-pattern-leading">
                    <svg
                      className="tool-pattern-icon"
                      aria-hidden
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={(row.icon ?? "tool") === "think" ? "currentColor" : "none"}
                      stroke="currentColor"
                    >
                      {Icons[row.icon ?? "tool"]}
                    </svg>
                    {expandable ? (
                      <svg
                        className="tool-pattern-chevron"
                        aria-hidden
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        style={{ transform: rowOpen ? undefined : "rotate(-90deg)" }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="tool-pattern-label">{row.label}</span>
                  {row.chip ? (
                    <code className="tool-pattern-input" title={row.chip}>
                      {row.chip}
                    </code>
                  ) : null}
                </Row>
                {expandable && rowOpen ? (
                  <div className="tool-pattern-output">
                    {row.detail?.map((line, index) => (
                      <span
                        key={index}
                        data-tone={line.tone}
                        className={row.detailMono ? "font-mono" : undefined}
                      >
                        {line.text || "\u00a0"}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
