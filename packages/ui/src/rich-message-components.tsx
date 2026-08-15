import { Fragment, type ReactNode, useEffect, useState } from "react";

export interface MessagePart {
  type: string;
  text?: string | null;
  state?: string | null;
  filename?: string | null;
  media_type?: string;
  mediaType?: string;
  size_bytes?: number | null;
  sizeBytes?: number | null;
  url?: string;
  attachment_id?: string | null;
  attachmentId?: string | null;
  tool_name?: string;
  toolName?: string;
  tool_invocation_id?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  error_text?: string | null;
  errorText?: string | null;
  approval?: unknown;
  title?: string | null;
  source_id?: string;
  data?: unknown;
  provider_metadata?: unknown;
}

export interface ConnectionView {
  id: string;
  name: string;
  description: string;
  status: string;
  authorizationUrl?: string;
}

export interface FileCardProps {
  part: MessagePart;
  sessionId: string;
  resolveAttachmentUrl: (sessionId: string, attachmentId: string) => Promise<string>;
  rewriteUrl: (url: string) => string;
}

export interface FileViewerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  url: string;
  mediaType: string;
  onClose: () => void;
}

export function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const connected = connection.status.toLowerCase() === "connected";
  const action = connected
    ? "Added"
    : connection.status.toLowerCase().includes("attention")
      ? "Retry"
      : "Authorize";
  return (
    <section className="connection-card">
      <span className="connection-icon">{connection.name.slice(0, 1).toUpperCase()}</span>
      <span className="connection-copy">
        <strong>{connection.name}</strong>
        <small>{connection.description || connection.status}</small>
      </span>
      {connection.authorizationUrl && !connected ? (
        <a href={connection.authorizationUrl} rel="noreferrer" target="_blank">
          {action}
        </a>
      ) : (
        <span className={`connection-status ${connected ? "connected" : ""}`}>{action}</span>
      )}
      <button
        aria-label={`${connection.name} connection actions`}
        className="connection-more"
        type="button"
      >
        ···
      </button>
    </section>
  );
}

export function ReasoningCard({ state = "", text }: { state?: string | null; text: string }) {
  return (
    <details className="reasoning-part" open={state === "streaming"}>
      <summary>{state === "streaming" ? "Thinking…" : "Reasoning"}</summary>
      <MarkdownText text={text} />
    </details>
  );
}

export function ToolCallCard({ part }: { part: MessagePart }) {
  const state = part.state ?? "";
  const error = part.error_text ?? part.errorText;
  return (
    <details className="tool-part" open={state.includes("approval")}>
      <summary>
        <span className={`tool-state ${state}`} />
        {part.tool_name ?? part.toolName ?? part.type.replace(/^tool-/, "") ?? "Tool"}
        <small>{formatState(state)}</small>
      </summary>
      {part.input !== undefined ? <JsonBlock label="Input" value={part.input} /> : null}
      {part.output !== undefined ? <JsonBlock label="Output" value={part.output} /> : null}
      {error ? <p className="part-error">{error}</p> : null}
      {part.approval ? <JsonBlock label="Approval" value={part.approval} /> : null}
    </details>
  );
}

export function FileCard({ part, sessionId, resolveAttachmentUrl, rewriteUrl }: FileCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const directUrl = part.url ? safeUrl(rewriteUrl(part.url)) : undefined;
  const attachmentId = part.attachment_id ?? part.attachmentId;
  const mediaType = part.media_type ?? part.mediaType ?? "application/octet-stream";
  const [resolvedUrl, setResolvedUrl] = useState(directUrl);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (resolvedUrl || !attachmentId || !mediaType.startsWith("image/")) return;
    let cancelled = false;
    void resolveAttachmentUrl(sessionId, attachmentId)
      .then((url) => {
        if (!cancelled) setResolvedUrl(safeUrl(url));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attachmentId, mediaType, resolveAttachmentUrl, resolvedUrl, sessionId]);

  async function open(): Promise<void> {
    if (resolvedUrl) {
      setViewerOpen(true);
      return;
    }
    if (!attachmentId || loading) return;
    setLoading(true);
    setError("");
    try {
      const url = await resolveAttachmentUrl(sessionId, attachmentId);
      const safe = safeUrl(url);
      if (!safe) throw new Error("Attachment URL is invalid");
      setResolvedUrl(safe);
      setViewerOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  const filename = part.filename || "Attachment";
  return (
    <>
      <button
        className="file-part"
        disabled={!resolvedUrl && !attachmentId}
        onClick={() => void open()}
        title={error || undefined}
        type="button"
      >
        {mediaType.startsWith("image/") && resolvedUrl ? (
          <img alt="" loading="lazy" src={resolvedUrl} />
        ) : (
          <span>↗</span>
        )}
        <span>
          <strong>{filename}</strong>
          <small>
            {error ||
              (loading
                ? "Preparing download…"
                : `${mediaType}${formatSize(part.size_bytes ?? part.sizeBytes)}`)}
          </small>
        </span>
      </button>
      {resolvedUrl ? (
        <FileViewer
          mediaType={mediaType}
          onClose={() => setViewerOpen(false)}
          open={viewerOpen}
          subtitle={mediaType}
          title={filename}
          url={resolvedUrl}
        />
      ) : null}
    </>
  );
}

export function FileViewer({ open, title, subtitle, url, mediaType, onClose }: FileViewerProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      aria-label={`Preview ${title}`}
      aria-modal="true"
      className="file-viewer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="file-viewer-panel">
        <header className="file-viewer-header">
          <span className="file-viewer-title">
            <strong>{title}</strong>
            {subtitle ? <small>{subtitle}</small> : null}
          </span>
          <span className="file-viewer-actions">
            <a aria-label="Open file in new window" href={url} rel="noreferrer" target="_blank">
              ↗
            </a>
            <button aria-label="Close preview" onClick={onClose} type="button">
              ×
            </button>
          </span>
        </header>
        <div className="file-viewer-body">
          {mediaType.startsWith("image/") ? (
            <img alt={title} src={url} />
          ) : mediaType.startsWith("video/") ? (
            <video controls src={url} />
          ) : mediaType.startsWith("audio/") ? (
            <audio controls src={url} />
          ) : (
            <iframe src={url} title={title} />
          )}
        </div>
      </div>
    </div>
  );
}

export function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  const blocks = text.split(/```/);
  return (
    <div className="markdown">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const newline = block.indexOf("\n");
          const language = newline >= 0 ? block.slice(0, newline).trim() : "";
          const code = newline >= 0 ? block.slice(newline + 1) : block;
          return (
            <div className="code-block" key={index}>
              {language ? <span>{language}</span> : null}
              <button onClick={() => void navigator.clipboard.writeText(code)} type="button">
                Copy
              </button>
              <pre>
                <code>{code.trimEnd()}</code>
              </pre>
            </div>
          );
        }
        return block
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((paragraph, paragraphIndex) => (
            <p key={`${index}-${paragraphIndex}`}>
              {paragraph.split("\n").map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 ? <br /> : null}
                  {inlineMarkdown(line)}
                </Fragment>
              ))}
            </p>
          ));
      })}
    </div>
  );
}

export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="json-block">
      <span>{label}</span>
      <pre>{stringify(value)}</pre>
    </div>
  );
}

export function safeUrl(value: string): string | undefined {
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatState(value: string | null | undefined): string {
  return value ? value.replaceAll("-", " ").replaceAll("_", " ") : "";
}

function formatSize(value: number | null | undefined): string {
  if (!value) return "";
  if (value < 1024) return ` · ${value} B`;
  if (value < 1024 * 1024) return ` · ${(value / 1024).toFixed(1)} KB`;
  return ` · ${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function inlineMarkdown(value: string): ReactNode[] {
  const pattern = /(`[^`]+`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const token = match[0];
    if (token.startsWith("`")) nodes.push(<code key={start}>{token.slice(1, -1)}</code>);
    else if (match[2] && match[3])
      nodes.push(
        <a href={match[3]} key={start} rel="noreferrer" target="_blank">
          {match[2]}
        </a>,
      );
    else if (match[4]) nodes.push(<strong key={start}>{match[4]}</strong>);
    cursor = start + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}
