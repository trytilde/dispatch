import type { NormalizedConfig } from "../config";
import { configFetch, configHeaders } from "../config";
import { errorFromResponse } from "../errors";
import { buildUrl, pathWithParams, teamPath } from "../internal/paths";
import type { JsonObject } from "../tools";

export type ChatKitSessionStreamFrame =
  | { type: "ready" | "cursor"; cursor: number }
  | { type: "event"; cursor: number; event: JsonObject };
export type ChatKitSessionStreamOptions = {
  sessionId: string;
  afterRevision?: number;
  signal?: AbortSignal;
  reconnect?: boolean;
};
export class ChatKitStreamProtocolError extends Error {}

/** Parse incremental UTF-8 SSE frames, including split CRLF and multiline data. */
export async function* parseSessionEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatKitSessionStreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      for (;;) {
        const boundary = /\r?\n\r?\n/.exec(buffer);
        if (!boundary || boundary.index === undefined) break;
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        let frame: unknown;
        try {
          frame = JSON.parse(data);
        } catch {
          throw new ChatKitStreamProtocolError("Invalid ChatKit event JSON");
        }
        if (!frame || typeof frame !== "object")
          throw new ChatKitStreamProtocolError("Invalid ChatKit event frame");
        const candidate = frame as {
          type?: unknown;
          cursor?: unknown;
          event?: unknown;
        };
        if (
          !["ready", "cursor", "event"].includes(String(candidate.type)) ||
          !Number.isSafeInteger(candidate.cursor) ||
          Number(candidate.cursor) < 0
        )
          throw new ChatKitStreamProtocolError("Invalid ChatKit event cursor or type");
        if (
          candidate.type === "event" &&
          (!candidate.event ||
            typeof candidate.event !== "object" ||
            Array.isArray(candidate.event))
        )
          throw new ChatKitStreamProtocolError("Invalid ChatKit event payload");
        yield frame as ChatKitSessionStreamFrame;
      }
      if (buffer.length > 8 * 1024 * 1024)
        throw new ChatKitStreamProtocolError("ChatKit event exceeds stream buffer limit");
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Resume from the last delivered revision; authentication failures require caller action. */
export async function* streamSessionEvents(
  config: NormalizedConfig,
  options: ChatKitSessionStreamOptions,
): AsyncGenerator<ChatKitSessionStreamFrame> {
  if (
    options.afterRevision !== undefined &&
    (!Number.isSafeInteger(options.afterRevision) || options.afterRevision < 0)
  )
    throw new TypeError("afterRevision must be a nonnegative safe integer");
  let cursor = options.afterRevision;
  let delay = 250;
  const path = pathWithParams(
    teamPath(config, "/api/v1/team/{team_id}/chatkit/sessions/{session_id}/events/stream"),
    { session_id: options.sessionId },
  );
  while (!options.signal?.aborted) {
    const headers = configHeaders(config);
    headers.set("Accept", "text/event-stream");
    let response: Response;
    try {
      response = await configFetch(config)(buildUrl(config, path, { after_revision: cursor }), {
        headers,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (options.signal?.aborted) return;
      if (options.reconnect === false) throw error;
      await reconnectDelay(delay, options.signal);
      delay = Math.min(delay * 2, 10_000);
      continue;
    }
    if (!response.ok) {
      if ((response.status >= 500 || response.status === 429) && options.reconnect !== false) {
        await response.body?.cancel();
        await reconnectDelay(delay, options.signal);
        delay = Math.min(delay * 2, 10_000);
        continue;
      }
      throw await errorFromResponse(response);
    }
    if (!response.body) throw new ChatKitStreamProtocolError("ChatKit stream omitted its body");
    try {
      for await (const frame of parseSessionEventStream(response.body)) {
        if (options.signal?.aborted) return;
        if (frame.type === "event" && cursor !== undefined && frame.cursor <= cursor) continue;
        if (cursor !== undefined && frame.cursor < cursor)
          throw new ChatKitStreamProtocolError(
            "ChatKit cursor moved backwards; fetch a fresh snapshot",
          );
        cursor = frame.cursor;
        delay = 250;
        yield frame;
      }
    } catch (error) {
      if (options.signal?.aborted) return;
      if (error instanceof ChatKitStreamProtocolError || options.reconnect === false) throw error;
    }
    if (options.reconnect === false || options.signal?.aborted) return;
    await reconnectDelay(delay, options.signal);
    delay = Math.min(delay * 2, 10_000);
  }
}
function reconnectDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
