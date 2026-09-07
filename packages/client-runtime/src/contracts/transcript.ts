import { z } from "zod";
import type { ChatMessage, ChatPart } from "./messages.js";
import type { ParticipantEvent } from "./events.js";
import type { SessionParticipant } from "./session.js";

export const ToolSummarySchema = z.object({
  executionId: z.string().nullish(),
  toolId: z.string().nullish(),
  toolName: z.string(),
  toolCallId: z.string(),
  state: z.string(),
  summary: z.string(),
});
export type ToolSummary = z.infer<typeof ToolSummarySchema>;
export const ToolExecutionViewSchema = z.object({
  execution_id: z.string(),
  tool_id: z.string(),
  tool_name: z.string(),
  state: z.string(),
  parent_execution_id: z.string().nullish(),
  batch_id: z.string().nullish(),
  batch_index: z.number().nullish(),
  summary: z.string().nullish(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error_message: z.string().nullish(),
});
export type ToolExecutionView = z.infer<typeof ToolExecutionViewSchema>;
export function isToolSummaryPart(
  part: Pick<ChatPart, "type" | "data_type" | "dataType">,
): boolean {
  return (
    part.type === "data-tilde-tool-summary" ||
    part.data_type === "tilde-tool-summary" ||
    part.dataType === "tilde-tool-summary"
  );
}
export function toolSummaryFromPart(
  part: Pick<ChatPart, "type" | "data" | "data_type" | "dataType">,
): ToolSummary | undefined {
  if (!isToolSummaryPart(part)) return undefined;
  const result = ToolSummarySchema.safeParse(part.data);
  return result.success ? result.data : undefined;
}
export type TranscriptContentBlock = { kind: "message" | "event"; parts: ChatPart[] };
/** Text and attachments communicate a message. Execution, reasoning and tool-owned UI are events. */
export function projectMessageParts(parts: readonly ChatPart[]): TranscriptContentBlock[] {
  const blocks: TranscriptContentBlock[] = [];
  for (const part of expandToolBatches(parts)) {
    if (
      part.type === "step-start" ||
      ((part.type === "text" || part.type === "reasoning") && !part.text?.trim())
    )
      continue;
    const kind = ["text", "file", "image", "source-url", "source-document"].includes(part.type)
      ? "message"
      : "event";
    const previous = blocks.at(-1);
    if (previous?.kind === kind) previous.parts.push(part);
    else blocks.push({ kind, parts: [part] });
  }
  return blocks;
}
export type ChatTranscriptItem =
  | {
      kind: "message" | "event";
      id: string;
      message: ChatMessage;
      parts: ChatPart[];
      alignment: "self" | "other";
    }
  | { kind: "participant"; id: string; event: ParticipantEvent };
export function projectChatTranscript(
  messages: readonly ChatMessage[],
  participantEvents: readonly ParticipantEvent[] = [],
  context: { viewerUserId?: string; participants?: readonly SessionParticipant[] } = {},
): ChatTranscriptItem[] {
  const output: Array<{ item: ChatTranscriptItem; timestamp: number; order: number }> = [];
  let order = 0;
  for (const message of messages) {
    const sender = context.participants?.find(
      (person) => person.id === message.from_inbox_instance_id,
    );
    const alignment = sender
      ? context.viewerUserId && sender.userId === context.viewerUserId
        ? "self"
        : "other"
      : message.role === "user"
        ? "self"
        : "other";
    const parts = message.parts?.length
      ? message.parts
      : message.text
        ? [{ type: "text", text: message.text }]
        : [];
    const blocks = projectMessageParts(parts);
    if (!blocks.length && message.type === "ui" && !message.text?.trim()) continue;
    if (!blocks.length)
      blocks.push({
        kind: message.type === "signal" || message.role === "system" ? "event" : "message",
        parts: [],
      });
    blocks.forEach((block, index) =>
      output.push({
        item: {
          ...block,
          kind: message.role === "system" || message.type === "signal" ? "event" : block.kind,
          id: `${message.id}:${index}`,
          message,
          alignment,
        },
        timestamp: Date.parse(message.created_at),
        order: order++,
      }),
    );
  }
  for (const event of participantEvents)
    output.push({
      item: { kind: "participant", id: event.id, event },
      timestamp: Date.parse(event.occurred_at),
      order: order++,
    });
  return output
    .sort((a, b) => a.timestamp - b.timestamp || a.order - b.order)
    .map((entry) => entry.item);
}

/** Calendar boundaries and adjacent-side grouping, independent of rendering. */
export function transcriptDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export type ChatTranscriptLayoutItem =
  | { kind: "day"; id: string; date: string }
  | (ChatTranscriptItem & { continuedPrevious: boolean; continuedNext: boolean });
export function layoutChatTranscript(
  items: readonly ChatTranscriptItem[],
): ChatTranscriptLayoutItem[] {
  const rows: ChatTranscriptLayoutItem[] = [];
  let previousDay = "";
  const day = (item: ChatTranscriptItem) =>
    transcriptDayKey(
      item.kind === "participant" ? item.event.occurred_at : item.message.created_at,
    );
  const sameSide = (item: ChatTranscriptItem, adjacent: ChatTranscriptItem | undefined) =>
    item.kind === "message" &&
    adjacent?.kind === "message" &&
    item.alignment === adjacent.alignment &&
    day(item) === day(adjacent);
  items.forEach((item, index) => {
    const date = day(item);
    if (date && date !== previousDay)
      rows.push({ kind: "day", id: `day:${date}:${item.id}`, date });
    previousDay = date;
    rows.push({
      ...item,
      continuedPrevious: sameSide(item, items[index - 1]),
      continuedNext: sameSide(item, items[index + 1]),
    });
  });
  return rows;
}

export interface ToolCallPresentation {
  text: string;
  state?: string;
  details?: { input?: unknown; output?: unknown; error?: string };
}
/** Summary projections never inherit raw fields, even if an adapter supplies them. */
export function toolCallPresentation(part: ChatPart): ToolCallPresentation {
  if (isToolSummaryPart(part)) {
    const summary = toolSummaryFromPart(part);
    return {
      text: summary?.summary || "Tool summary unavailable",
      ...(summary ? { state: summary.state } : {}),
    };
  }
  const error = part.error_text ?? part.errorText ?? undefined;
  const text =
    part.summary?.trim() ||
    part.text?.trim() ||
    error ||
    (part.state?.includes("error")
      ? "Tool failed"
      : part.output !== undefined
        ? "Tool completed"
        : part.input !== undefined
          ? "Running tool…"
          : "Tool call");
  const hasDetails = part.input !== undefined || part.output !== undefined || Boolean(error);
  return {
    text,
    ...(part.state ? { state: part.state } : {}),
    ...(hasDetails
      ? {
          details: {
            ...(part.input !== undefined ? { input: part.input } : {}),
            ...(part.output !== undefined ? { output: part.output } : {}),
            ...(error ? { error } : {}),
          },
        }
      : {}),
  };
}

/** Unambiguous inline arguments; formatting does not inspect provider metadata. */
export function formatToolArguments(input: unknown): string {
  const value = (item: unknown) => JSON.stringify(item) ?? "undefined";
  if (input === undefined) return "";
  if (input !== null && typeof input === "object" && !Array.isArray(input))
    return Object.entries(input)
      .map(([name, item]) => `$${name} = ${value(item)}`)
      .join(", ");
  return `$input = ${value(input)}`;
}

const recordValue = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function toolValue(value: unknown): Record<string, unknown> {
  const record = recordValue(value);
  return record.type === "json" ? recordValue(record.value) : record;
}
/** MULTI_EXECUTE_TOOL is transport composition, never a visible tool-call row. */
export function expandToolBatches(parts: readonly ChatPart[], depth = 0): ChatPart[] {
  return parts.flatMap((part, partIndex) => {
    const name =
      part.tool_name ??
      part.toolName ??
      (isToolSummaryPart(part)
        ? toolSummaryFromPart(part)?.toolName
        : part.type.replace(/^tool-/, ""));
    if (name?.toUpperCase() !== "MULTI_EXECUTE_TOOL") return [part];
    // Redacted summaries do not authorize revealing embedded raw fields.
    if (isToolSummaryPart(part) || depth >= 8) return [];
    const input = toolValue(part.input),
      output = toolValue(part.output);
    const invocations = Array.isArray(input.invocations) ? input.invocations.map(recordValue) : [];
    const results = Array.isArray(output.results) ? output.results.map(recordValue) : [];
    const count = Math.max(invocations.length, results.length);
    const children: ChatPart[] = [];
    for (let index = 0; index < count; index++) {
      const invocation = invocations[index],
        result = results[index];
      const toolName = result?.tool_name ?? invocation?.tool_name;
      if (typeof toolName !== "string") continue;
      const error =
        typeof result?.error === "string" ? result.error : (part.error_text ?? part.errorText);
      const failed = result?.success === false || Boolean(error);
      children.push({
        type: "tool",
        tool_name: toolName,
        tool_invocation_id: `${part.tool_invocation_id ?? part.toolCallId ?? partIndex}:batch:${index}`,
        text: toolName,
        state: failed
          ? "output-error"
          : result
            ? "output-available"
            : (part.state ?? "input-available"),
        ...(invocation?.parameters !== undefined ? { input: invocation.parameters } : {}),
        ...(result?.output !== undefined ? { output: result.output } : {}),
        ...(error ? { error_text: error } : {}),
      });
    }
    return expandToolBatches(children, depth + 1);
  });
}
