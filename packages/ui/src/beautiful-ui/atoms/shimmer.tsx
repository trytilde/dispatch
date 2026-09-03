"use client";

/* ─────────────────────────────────────────────────────────
 * SHIMMER
 * Text with a soft highlight sweeping across it, for busy
 * labels ("Thinking…"). Dispatch reconstruction of the
 * Beautiful UI atom API.
 * ───────────────────────────────────────────────────────── */

export interface ShimmerProps {
  className?: string;
  children: React.ReactNode;
}

export function Shimmer({ className, children }: ShimmerProps) {
  return (
    <span
      className={`inline-block bg-clip-text text-transparent ${className ?? ""}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--ink-3) 0%, var(--ink-3) 25%, var(--ink) 60%, var(--ink-3) 75%, var(--ink-3) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 2.2s ease-in-out infinite",
      }}
    >
      {children}
    </span>
  );
}
