import type { ReactNode } from "react";
import { ConstructionIcon, InboxIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "./components/ui/badge.js";
import { cn } from "./lib/utils.js";

/** Shared building blocks so every panel reads the same way. */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium tracking-wide text-ink-2 uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function ComingSoon({ title, body }: { title: string; body: string; flag?: string }) {
  return (
    <div
      className="flex gap-4 rounded-2xl border border-dashed bg-card/60 p-5"
      data-testid="coming-soon"
      role="status"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-inset text-ink-2">
        <ConstructionIcon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <Badge variant="outline">Coming soon</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export function ErrorNotice({
  title = "Something went wrong",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div
      className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
      role="alert"
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div>
        <p className="font-medium text-destructive">{title}</p>
        <p className="mt-0.5 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
        <InboxIcon className="size-5" />
      </span>
      <p className="text-base font-semibold">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          aria-hidden
          className="h-14 w-full animate-pulse rounded-xl bg-inset motion-reduce:animate-none"
          key={index}
        />
      ))}
    </div>
  );
}

export function StatusDot({ tone }: { tone: "good" | "warn" | "bad" | "idle" }) {
  const color =
    tone === "good"
      ? "bg-green"
      : tone === "warn"
        ? "bg-ink-2"
        : tone === "bad"
          ? "bg-destructive"
          : "bg-muted-foreground/50";
  return <span aria-hidden className={cn("inline-block size-2 rounded-full", color)} />;
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
