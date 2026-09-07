import { describe, expect, it, vi } from "vite-plus/test";
import { createClient } from "../src";
import { parseSessionEventStream } from "../src/chatkit/session-stream";

function chunks(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}
describe("custom streaming transports", () => {
  it("parses split CRLF delimiters and multiline data without dropping events", async () => {
    const frames = [];
    for await (const frame of parseSessionEventStream(
      chunks([
        'event: event\r\ndata: {"type":"event",\r',
        '\ndata: "cursor":12,"event":{"text":"hello"}}\r\n\r',
        "\n",
      ]),
    ))
      frames.push(frame);
    expect(frames).toEqual([{ type: "event", cursor: 12, event: { text: "hello" } }]);
  });
  it("reconnects using the last event cursor and retains caller authorization", async () => {
    const abort = new AbortController();
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(
      new Response(
        chunks([
          'data: {"type":"ready","cursor":10}\n\ndata: {"type":"event","cursor":11,"event":{"text":"first"}}\n\n',
        ]),
      ),
    );
    fetcher.mockResolvedValueOnce(
      new Response(
        chunks([
          'data: {"type":"ready","cursor":11}\n\ndata: {"type":"event","cursor":12,"event":{"text":"second"}}\n\n',
        ]),
      ),
    );
    const client = createClient({
      baseUrl: "https://api.example",
      orgSubdomain: false,
      orgId: "org",
      teamId: "team",
      bearerToken: "caller",
      fetch: fetcher,
    });
    const events: string[] = [];
    for await (const frame of client.chatkit.streamSessionEvents({
      sessionId: "session",
      signal: abort.signal,
    })) {
      if (frame.type === "event") {
        events.push(typeof frame.event.text === "string" ? frame.event.text : "");
        if (events.length === 2) abort.abort();
      }
    }
    expect(events).toEqual(["first", "second"]);
    expect(requestUrl(fetcher.mock.calls[1]![0])).toContain("after_revision=11");
    expect(new Headers(fetcher.mock.calls[1]![1]?.headers).get("authorization")).toBe(
      "Bearer caller",
    );
  });
  it("stops reconnecting when session access is revoked", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ msg: "Session access revoked" }, { status: 403 }),
    );
    const client = createClient({
      baseUrl: "https://api.example",
      orgSubdomain: false,
      teamId: "team",
      bearerToken: "caller",
      fetch: fetcher,
    });
    await expect(
      client.chatkit.streamSessionEvents({ sessionId: "session" }).next(),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

function requestUrl(value: Parameters<typeof fetch>[0]): string {
  return typeof value === "string" ? value : value instanceof URL ? value.href : value.url;
}
