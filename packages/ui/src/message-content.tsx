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

export interface MessageContentMessage {
  type: string;
  session_id: string;
  text?: string;
  summary?: string | null;
  data?: Record<string, unknown> | null;
  parts?: MessagePart[];
  metadata?: unknown;
}

export interface MessageContentProps {
  message: MessageContentMessage;
  resolveAttachmentUrl: (sessionId: string, attachmentId: string) => Promise<string>;
  rewriteUrl?: (url: string) => string;
}

export function MessageContent({
  message,
  resolveAttachmentUrl,
  rewriteUrl = (url) => url,
}: MessageContentProps) {
  if (message.type === "ui" && message.parts) {
    return (
      <div className="message-parts">
        {message.parts.map((part, index) =>
          renderPart(part, index, message.session_id, resolveAttachmentUrl, rewriteUrl),
        )}
      </div>
    );
  }
  return <MarkdownText text={message.text ?? signalText(message)} />;
}

function renderPart(
  part: MessagePart,
  index: number,
  sessionId: string,
  resolveAttachmentUrl: MessageContentProps["resolveAttachmentUrl"],
  rewriteUrl: NonNullable<MessageContentProps["rewriteUrl"]>,
): ReactNode {
  const key = `${part.type}-${part.tool_invocation_id ?? part.toolCallId ?? part.attachment_id ?? part.attachmentId ?? index}`;
  if (isToolPart(part)) return <ToolPart key={key} part={part} />;
  switch (part.type) {
    case "text":
      return <MarkdownText key={key} text={part.text ?? ""} />;
    case "reasoning":
      return part.text ? (
        <details className="reasoning-part" key={key} open={part.state === "streaming"}>
          <summary>{part.state === "streaming" ? "Thinking…" : "Reasoning"}</summary>
          <MarkdownText text={part.text} />
        </details>
      ) : null;
    case "file": {
      return (
        <FilePart
          key={key}
          part={part}
          sessionId={sessionId}
          resolveAttachmentUrl={resolveAttachmentUrl}
          rewriteUrl={rewriteUrl}
        />
      );
    }
    case "source-url": {
      const href = part.url ? safeUrl(part.url) : undefined;
      return href ? (
        <a className="source-part" href={href} key={key} rel="noreferrer" target="_blank">
          {part.title || href} <span>↗</span>
        </a>
      ) : null;
    }
    case "source-document":
      return (
        <span className="source-part" key={key}>
          {part.title || part.filename || "Source document"}
        </span>
      );
    case "step-start":
      return <hr className="step-start" key={key} />;
    case "data":
      return <JsonBlock key={key} label="Data" value={part.data ?? part} />;
    case "connector":
    case "send-message/connector":
      return <ConnectionCard key={key} connection={connectionFrom(part)} />;
    case "connectors":
    case "send-message/connectors":
      return (
        <div className="connection-list" key={key}>
          <strong>Connect tools</strong>
          {connectionsFrom(part).map((connection) => (
            <ConnectionCard connection={connection} key={connection.id} />
          ))}
        </div>
      );
    default:
      return <JsonBlock key={key} label={formatState(part.type)} value={part} />;
  }
}

interface ConnectionView {
  id: string;
  name: string;
  description: string;
  status: string;
  authorizationUrl?: string;
}

function ConnectionCard({ connection }: { connection: ConnectionView }) {
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
      <button className="connection-more" aria-label={`${connection.name} connection actions`}>
        ···
      </button>
    </section>
  );
}

function connectionFrom(part: MessagePart): ConnectionView {
  const data = asRecord(part.data);
  const nested = asRecord(data.message);
  const name = firstText(
    part,
    data,
    nested,
    "connector",
    "name",
    "display_name",
    "displayName",
    "title",
    "provider",
  );
  const variant = firstText(part, data, nested, "variant", "status", "state");
  const authorizationUrl = safeUrl(
    firstText(
      part,
      data,
      nested,
      "authorization_url",
      "authorizationUrl",
      "authorize_url",
      "authorizeUrl",
      "auth_url",
      "authUrl",
      "url",
    ),
  );
  return {
    id:
      firstText(part, data, nested, "id", "server_id", "serverId", "connector_id", "connectorId") ||
      name ||
      "connection",
    name: name || "Connection",
    description: firstText(part, data, nested, "reason", "description", "subtitle"),
    status: variant === "connected" ? "Connected" : variant || "Needs authorization",
    ...(authorizationUrl ? { authorizationUrl } : {}),
  };
}

function connectionsFrom(part: MessagePart): ConnectionView[] {
  const data = asRecord(part.data);
  const source = part as unknown as Record<string, unknown>;
  const candidates = Array.isArray(part.data)
    ? part.data
    : Array.isArray(source.connectors)
      ? source.connectors
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.connectors)
          ? data.connectors
          : [];
  return candidates.map((candidate) => connectionFrom({ type: "connector", data: candidate }));
}

function firstText(
  part: MessagePart,
  data: Record<string, unknown>,
  nested: Record<string, unknown>,
  ...keys: string[]
): string {
  const source = part as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (typeof source[key] === "string") return source[key];
    if (typeof data[key] === "string") return data[key];
    if (typeof nested[key] === "string") return nested[key];
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isToolPart(part: MessagePart): boolean {
  return part.type === "tool" || part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function ToolPart({ part }: { part: MessagePart }) {
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

interface FilePartProps {
  part: MessagePart;
  sessionId: string;
  resolveAttachmentUrl: MessageContentProps["resolveAttachmentUrl"];
  rewriteUrl: NonNullable<MessageContentProps["rewriteUrl"]>;
}

function FilePart({ part, sessionId, resolveAttachmentUrl, rewriteUrl }: FilePartProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const directUrl = part.url ? safeUrl(rewriteUrl(part.url)) : undefined;
  const attachmentId = part.attachment_id ?? part.attachmentId;
  const mediaType = part.media_type ?? part.mediaType ?? "application/octet-stream";
  const [resolvedUrl, setResolvedUrl] = useState(directUrl);

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
      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!attachmentId || loading) return;
    setLoading(true);
    setError("");
    try {
      const url = await resolveAttachmentUrl(sessionId, attachmentId);
      setResolvedUrl(safeUrl(url));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="file-part"
      type="button"
      onClick={() => void open()}
      disabled={!resolvedUrl && !attachmentId}
      title={error || undefined}
    >
      {mediaType.startsWith("image/") && resolvedUrl ? (
        <img src={resolvedUrl} alt="" loading="lazy" />
      ) : (
        <span>↗</span>
      )}
      <span>
        <strong>{part.filename || "Attachment"}</strong>
        <small>
          {error ||
            (loading
              ? "Preparing download…"
              : `${mediaType}${formatSize(part.size_bytes ?? part.sizeBytes)}`)}
        </small>
      </span>
    </button>
  );
}

function formatSize(value: number | null | undefined): string {
  if (!value) return "";
  if (value < 1024) return ` · ${value} B`;
  if (value < 1024 * 1024) return ` · ${(value / 1024).toFixed(1)} KB`;
  return ` · ${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function MarkdownText({ text }: { text: string }) {
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
              <button onClick={() => void navigator.clipboard.writeText(code)}>Copy</button>
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

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="json-block">
      <span>{label}</span>
      <pre>{stringify(value)}</pre>
    </div>
  );
}

function signalText(message: MessageContentMessage): string {
  if (message.summary) return message.summary;
  const metadata = message.metadata;
  if (typeof metadata === "object" && metadata !== null && "summary" in metadata) {
    return String((metadata as { summary: unknown }).summary);
  }
  if (message.type === "signal" && message.data) return stringify(message.data);
  return message.type === "signal" ? "Signal received" : "";
}

function safeUrl(value: string): string | undefined {
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatState(value: string | null | undefined): string {
  return value ? value.replaceAll("-", " ").replaceAll("_", " ") : "";
}
