import { ToolCallEvent, ToolCallChain } from "./chat-events.js";
import { TraceBlock, type TraceRow } from "./beautiful-ui/blocks/trace-block.js";
import { isConnectorSelectionPart } from "./connector-components.js";
import { toolCallPresentation, expandToolBatches } from "@tryopenbot/client-runtime";
import { type MessagePart } from "./rich-message-components.js";

/* Assistant output is split into standalone blocks: text stays in chat
 * bubbles; thinking traces, tool runs, and attachments render as their
 * own rows in the transcript. */

export type MessageSegment =
  | { kind: "text"; text: string }
  /** A contiguous agent run — reasoning and tool calls, in order. */
  | { kind: "run"; parts: MessagePart[] }
  | { kind: "files"; parts: MessagePart[] }
  | { kind: "other"; part: MessagePart };

export function splitMessageSegments(parts: readonly MessagePart[]): MessageSegment[] {
  const segments: MessageSegment[] = [];
  for (const part of expandToolBatches(parts)) {
    const previous = segments.at(-1);
    if (part.type === "step-start") continue;
    if (part.type === "text") {
      const text = part.text ?? "";
      if (!text.trim()) continue;
      if (previous?.kind === "text") previous.text += `\n\n${text}`;
      else segments.push({ kind: "text", text });
      continue;
    }
    // A completed connector-selection tool call renders as its own
    // interactive card row, never as a collapsed tool chip.
    if (isConnectorSelectionPart(part)) {
      segments.push({ kind: "other", part });
      continue;
    }
    if (part.type === "reasoning" || isToolPart(part)) {
      if (part.type === "reasoning" && !part.text?.trim()) continue;
      if (previous?.kind === "run") previous.parts.push(part);
      else segments.push({ kind: "run", parts: [part] });
      continue;
    }
    if (part.type === "file" || part.type === "image") {
      appendFilePart(segments, part);
      continue;
    }
    segments.push({ kind: "other", part });
  }
  return segments;
}

export interface ThinkingBlockProps {
  part: MessagePart;
  working?: boolean;
}

export function ThinkingBlock({ part, working = false }: ThinkingBlockProps) {
  const streaming = working || part.state === "streaming";
  const rows: TraceRow[] = (part.text ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      id: `${index}`,
      primary: paragraph,
      prose: true,
    }));
  return (
    <TraceBlock
      activeLabel="Thinking"
      doneLabel="Thought for a few seconds"
      rows={rows}
      working={streaming}
    />
  );
}

export interface ToolsBlockProps {
  parts: readonly MessagePart[];
}

/** Compatibility composition: every generic execution uses the same event row. */
export function ToolsBlock({ parts }: ToolsBlockProps) {
  parts = expandToolBatches(parts);
  if (parts.length > 1 && parts.every((part) => part.type !== "reasoning"))
    return (
      <ToolCallChain
        calls={parts.map((part, index) => ({
          id: part.toolCallId ?? `${index}`,
          call: toolCallPresentation(part),
        }))}
      />
    );
  return (
    <>
      {parts.map((part, index) =>
        part.type === "reasoning" ? (
          <ThinkingBlock key={index} part={part} />
        ) : (
          <ToolCallEvent key={part.toolCallId ?? index} call={toolCallPresentation(part)} />
        ),
      )}
    </>
  );
}

function isToolPart(part: MessagePart): boolean {
  return part.type === "tool" || part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

/** Media-producing tools return a ChatKit attachment reference, not user-facing JSON. */
export function toolAttachmentFilePart(part: MessagePart): MessagePart | undefined {
  if (!isToolPart(part)) return undefined;
  const outer = objectValue(part.output);
  const output =
    Object.keys(objectValue(outer.image)).length > 0 ? objectValue(outer.image) : outer;
  const attachmentId = stringValue(output.attachment_id ?? output.attachmentId);
  const mediaType =
    stringValue(output.media_type ?? output.mediaType) || "application/octet-stream";
  const inlineUrl = inlineImageUrl(
    mediaType,
    stringValue(output.data ?? output.content_base64 ?? output.base64),
  );
  if (!attachmentId && !inlineUrl) return undefined;
  return {
    type: "file",
    ...(attachmentId ? { attachment_id: attachmentId } : {}),
    ...(inlineUrl ? { url: inlineUrl } : {}),
    media_type: mediaType,
    filename: stringValue(output.filename) || defaultAttachmentName(mediaType),
  };
}

function inlineImageUrl(mediaType: string, base64: string): string | undefined {
  if (!/^image\/(?:png|jpeg|gif|webp)$/i.test(mediaType) || !/^[a-z0-9+/=\s]+$/i.test(base64))
    return undefined;
  return `data:${mediaType.toLowerCase()};base64,${base64.replaceAll(/\s+/g, "")}`;
}

function defaultAttachmentName(mediaType: string): string {
  if (mediaType.startsWith("image/")) return "Image";
  if (mediaType.startsWith("video/")) return "Video";
  if (mediaType.startsWith("audio/")) return "Audio";
  return "Attachment";
}

function appendFilePart(segments: MessageSegment[], part: MessagePart): void {
  const attachmentId = part.attachment_id ?? part.attachmentId;
  if (
    attachmentId &&
    segments.some(
      (segment) =>
        segment.kind === "files" &&
        segment.parts.some(
          (candidate) => (candidate.attachment_id ?? candidate.attachmentId) === attachmentId,
        ),
    )
  )
    return;
  const previous = segments.at(-1);
  if (previous?.kind === "files") previous.parts.push(part);
  else segments.push({ kind: "files", parts: [part] });
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      // A non-JSON tool result remains a normal tool trace.
    }
  }
  return {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
