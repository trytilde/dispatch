import type { ReactNode } from "react";
import {
  formatToolArguments,
  type ToolSummary,
  type ToolCallPresentation,
} from "@tryopenbot/client-runtime";
import { ToolChipsBlock, type ToolChipRow } from "./beautiful-ui/blocks/tool-chips-block.js";

/** Execution activity is never wrapped in a conversational message bubble. */
export function ChatEventSurface({
  children,
  label = "Chat event",
  messageId,
}: {
  children: ReactNode;
  label?: string;
  messageId?: string;
}) {
  return (
    <div className="chat-event" role="group" aria-label={label} data-message-id={messageId}>
      {children}
    </div>
  );
}

export interface ToolCallChainItem {
  id: string;
  call: ToolCallPresentation;
}
function toolRow({ id, call }: ToolCallChainItem): ToolChipRow {
  const output =
    typeof call.details?.output === "string"
      ? call.details.output
      : call.details?.output !== undefined
        ? JSON.stringify(call.details.output, null, 2)
        : undefined;
  const lines = [
    ...(output !== undefined ? output.split("\n").map((text) => ({ text })) : []),
    ...(call.details?.error
      ? call.details.error.split("\n").map((text) => ({ text, tone: "error" as const }))
      : []),
  ];
  return {
    id,
    icon: "tool",
    label: call.text,
    ...(call.details?.input !== undefined
      ? { chip: formatToolArguments(call.details.input), mono: true }
      : {}),
    ...(lines.length ? { detail: lines, detailMono: true } : {}),
    failed: Boolean(call.details?.error) || call.state === "output-error",
    pending: Boolean(call.details) && call.details?.output === undefined && !call.details?.error,
  };
}
export function ToolCallEvent({ call }: { call: ToolCallPresentation }) {
  return (
    <section className="tool-call-event" aria-label="Tool call" data-state={call.state}>
      <ToolChipsBlock rows={[toolRow({ id: "call", call })]} />
    </section>
  );
}
export function ToolCallChain({ calls }: { calls: readonly ToolCallChainItem[] }) {
  return (
    <section className="tool-call-chain" aria-label="Tool calls">
      <ToolChipsBlock
        headerLabel={
          calls.length > 1 && calls.some((item) => item.call.details)
            ? `${calls.length} tool calls`
            : undefined
        }
        rows={calls.map(toolRow)}
      />
    </section>
  );
}
export function ToolSummaryEvent({ summary }: { summary: ToolSummary }) {
  return <ToolCallEvent call={{ text: summary.summary, state: summary.state }} />;
}
