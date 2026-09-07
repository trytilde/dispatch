"use client";

import { ConnectorEnableCard } from "./connector-enable-card.js";
import { ConversationMessage, type ConversationMessageProps } from "./chat-components.js";
import {
  isToolSummaryPart,
  toolCallPresentation,
  expandToolBatches,
  connectorSetupRequestFromPart,
  type ConnectorSetupRequest,
} from "@tryopenbot/client-runtime";
import { ToolCallEvent, ToolCallChain } from "./chat-events.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  connectorSelectionViewFromPart,
  type ConnectorAccountView,
  type ConnectorSelectionView,
} from "./connector-components.js";
import { ThinkingBlock, toolAttachmentFilePart } from "./message-blocks.js";
import {
  ConnectionCard,
  FileCard,
  MediaViewer,
  type MediaViewerItem,
  formatState,
  JsonBlock,
  MarkdownText,
  type MessagePart,
  safeUrl,
  stringify,
  type ConnectionView,
} from "./rich-message-components.js";

export type { MessagePart } from "./rich-message-components.js";

export interface MessageContentMessage {
  type: string;
  session_id: string;
  text?: string;
  summary?: string | null;
  data?: Record<string, unknown> | null;
  parts?: MessagePart[];
  metadata?: unknown;
}

/** Owner interactions for in-chat connector selection cards. */
export interface ConnectorPartActions {
  onSetupRequired?: (request: ConnectorSetupRequest) => void;
  onSelectAccount: (selection: ConnectorSelectionView, account: ConnectorAccountView) => void;
  onAddAccount: (selection: ConnectorSelectionView) => void;
  busy?: boolean;
}

export interface MessageContentProps {
  message: MessageContentMessage;
  resolveAttachmentUrl: (sessionId: string, attachmentId: string) => Promise<string>;
  rewriteUrl?: (url: string) => string;
  connectorActions?: ConnectorPartActions;
}

export function MessageContent({
  message,
  resolveAttachmentUrl,
  rewriteUrl = (url) => url,
  connectorActions,
}: MessageContentProps) {
  if (message.type === "ui" && message.parts) {
    const mediaParts = message.parts.filter(
      (part) => part.type === "file" || part.type === "image",
    );
    const imageGallery =
      mediaParts.length > 1 &&
      mediaParts.length === message.parts.length &&
      mediaParts.every((part) => (part.media_type ?? part.mediaType ?? "").startsWith("image/"));
    return (
      <div className={`message-parts ${imageGallery ? "media-gallery" : ""}`}>
        {renderContentParts(
          message.parts,
          message.session_id,
          resolveAttachmentUrl,
          rewriteUrl,
          connectorActions,
        )}
      </div>
    );
  }
  // Regular messages can carry attachments alongside (or instead of) text.
  const attachmentParts = (message.parts ?? []).filter(
    (part) => part.type === "file" || part.type === "image",
  );
  const text = message.text ?? signalText(message);
  if (attachmentParts.length > 0) {
    return (
      <div className="message-parts">
        {text.trim() ? <MarkdownText text={text} /> : null}
        {attachmentParts.map((part, index) =>
          renderPart(
            { ...part, type: "file" },
            index,
            message.session_id,
            resolveAttachmentUrl,
            rewriteUrl,
          ),
        )}
      </div>
    );
  }
  return <MarkdownText text={text} />;
}

/** Only contiguous generic tools form a chain; dedicated tool UIs remain boundaries. */
function renderContentParts(
  parts: readonly MessagePart[],
  sessionId: string,
  resolveAttachmentUrl: MessageContentProps["resolveAttachmentUrl"],
  rewriteUrl: NonNullable<MessageContentProps["rewriteUrl"]>,
  connectorActions?: ConnectorPartActions,
): ReactNode[] {
  parts = expandToolBatches(parts);
  const generic = (part: MessagePart) =>
    isToolSummaryPart(part) ||
    (isToolPart(part) &&
      !connectorSetupRequestFromPart(part) &&
      !connectorSelectionViewFromPart(part) &&
      !toolAttachmentFilePart(part));
  const output: ReactNode[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (generic(part)) {
      const start = index;
      const calls = [
        {
          id: part.toolCallId ?? part.tool_invocation_id ?? `${index}`,
          call: toolCallPresentation(part),
        },
      ];
      while (parts[index + 1] && generic(parts[index + 1]!)) {
        const next = parts[++index]!;
        calls.push({
          id: next.toolCallId ?? next.tool_invocation_id ?? `${index}`,
          call: toolCallPresentation(next),
        });
      }
      output.push(
        calls.length > 1 ? (
          <ToolCallChain key={`tools-${start}`} calls={calls} />
        ) : (
          <ToolCallEvent key={`tools-${start}`} call={calls[0]!.call} />
        ),
      );
    } else
      output.push(
        renderPart(part, index, sessionId, resolveAttachmentUrl, rewriteUrl, connectorActions),
      );
  }
  return output;
}

function renderPart(
  part: MessagePart,
  index: number,
  sessionId: string,
  resolveAttachmentUrl: MessageContentProps["resolveAttachmentUrl"],
  rewriteUrl: NonNullable<MessageContentProps["rewriteUrl"]>,
  connectorActions?: ConnectorPartActions,
): ReactNode {
  const key = `${part.type}-${part.tool_invocation_id ?? part.toolCallId ?? part.attachment_id ?? part.attachmentId ?? index}`;
  if (isToolSummaryPart(part)) return <ToolCallEvent key={key} call={toolCallPresentation(part)} />;
  const setupRequest = connectorSetupRequestFromPart(part);
  if (setupRequest)
    return (
      <ConnectorEnableCard
        key={key}
        providerName={setupRequest.provider_name}
        iconUrl={setupRequest.icon_url ?? undefined}
        disabled={!connectorActions?.onSetupRequired || connectorActions.busy}
        onEnable={() => connectorActions?.onSetupRequired?.(setupRequest)}
      />
    );
  const connectorSelection = connectorSelectionViewFromPart(part);
  if (connectorSelection)
    return (
      <ConnectorEnableCard
        key={key}
        providerName={connectorSelection.providerName}
        iconUrl={connectorSelection.iconUrl}
        disabled={!connectorActions || connectorActions.busy}
        onEnable={() => connectorActions?.onAddAccount(connectorSelection)}
      />
    );
  const toolAttachment = toolAttachmentFilePart(part);
  if (toolAttachment)
    return (
      <FileCard
        key={key}
        part={toolAttachment}
        sessionId={sessionId}
        resolveAttachmentUrl={resolveAttachmentUrl}
        rewriteUrl={rewriteUrl}
      />
    );
  if (isToolPart(part)) return <ToolCallEvent key={key} call={toolCallPresentation(part)} />;
  switch (part.type) {
    case "text":
      return <MarkdownText key={key} text={part.text ?? ""} />;
    case "reasoning":
      return part.text ? <ThinkingBlock key={key} part={part} /> : null;
    case "image":
    case "file": {
      return (
        <FileCard
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

function signalText(message: MessageContentMessage): string {
  if (message.summary) return message.summary;
  const metadata = message.metadata;
  if (typeof metadata === "object" && metadata !== null && "summary" in metadata) {
    return String((metadata as { summary: unknown }).summary);
  }
  if (message.type === "signal" && message.data) return stringify(message.data);
  return message.type === "signal" ? "Signal received" : "";
}

/** One message: content in a bubble and attachment chips immediately underneath. */
export function ChatMessage({
  message,
  resolveAttachmentUrl,
  rewriteUrl = (url) => url,
  connectorActions,
  ...presentation
}: MessageContentProps & Omit<ConversationMessageProps, "children" | "attachments">) {
  const [gallery, setGallery] = useState<{ items: MediaViewerItem[]; index: number }>();
  const previewRequest = useRef(0);
  useEffect(() => {
    setGallery(undefined);
    return () => {
      previewRequest.current++;
    };
  }, [message.session_id, presentation.messageId]);
  const isDetachedFile = (part: MessagePart) =>
    (part.type === "file" || part.type === "image") &&
    !(part.media_type ?? part.mediaType ?? "").startsWith("audio/");
  const files = (message.parts ?? []).filter(isDetachedFile);
  const parts = (message.parts ?? []).filter((part) => !isDetachedFile(part));
  const hasText = parts.length > 0 || Boolean(message.text?.trim());
  const isGalleryFile = (part: MessagePart) =>
    /^(image|video)\//.test(part.media_type ?? part.mediaType ?? "");
  async function openGallery(clicked: MessagePart, clickedUrl: string) {
    const request = ++previewRequest.current;
    const media = files.filter(isGalleryFile);
    const results = await Promise.allSettled(
      media.map(async (part, index): Promise<MediaViewerItem> => {
        const attachmentId = part.attachment_id ?? part.attachmentId;
        const url =
          part === clicked
            ? clickedUrl
            : part.url
              ? safeUrl(rewriteUrl(part.url))
              : attachmentId
                ? safeUrl(await resolveAttachmentUrl(message.session_id, attachmentId))
                : undefined;
        if (!url) throw new Error("Preview unavailable");
        return {
          id: String(index),
          title: part.filename ?? (typeof part.name === "string" ? part.name : "Attachment"),
          url,
          mediaType: part.media_type ?? part.mediaType ?? "image/*",
        };
      }),
    );
    if (request !== previewRequest.current) return;
    const items = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    setGallery({
      items,
      index: Math.max(
        0,
        items.findIndex((item) => item.id === String(media.indexOf(clicked))),
      ),
    });
  }

  return (
    <>
      <ConversationMessage
        {...presentation}
        attachments={
          files.length
            ? files.map((part, index) => (
                <FileCard
                  key={part.attachment_id ?? part.attachmentId ?? index}
                  compact
                  onPreview={
                    isGalleryFile(part)
                      ? (url) => {
                          void openGallery(part, url);
                        }
                      : undefined
                  }
                  part={part}
                  sessionId={message.session_id}
                  resolveAttachmentUrl={resolveAttachmentUrl}
                  rewriteUrl={rewriteUrl}
                />
              ))
            : undefined
        }
      >
        {hasText ? (
          <MessageContent
            message={{ ...message, parts }}
            resolveAttachmentUrl={resolveAttachmentUrl}
            rewriteUrl={rewriteUrl}
            connectorActions={connectorActions}
          />
        ) : null}
      </ConversationMessage>
      <MediaViewer
        open={Boolean(gallery)}
        items={gallery?.items ?? []}
        activeIndex={gallery?.index ?? 0}
        onSelect={(index) => setGallery((current) => (current ? { ...current, index } : undefined))}
        onClose={() => {
          previewRequest.current++;
          setGallery(undefined);
        }}
      />
    </>
  );
}
