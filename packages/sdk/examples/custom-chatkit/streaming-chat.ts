import type { Client } from "@trytilde/sdk";

/**
 * A custom SSE protocol over canonical ChatKit sessions. Authenticate must return
 * a client bound to the requesting user, never a shared administrator credential.
 * The API rechecks session membership and audience visibility throughout the stream.
 */
export function streamingChatTransport(
  authenticate: (request: Request) => Promise<Client>,
) {
  return async (request: Request): Promise<Response> => {
    const client = await authenticate(request);
    if (request.method === "POST") {
      const input = (await request.json()) as {
        agentId?: unknown;
        sessionId?: unknown;
        text?: unknown;
      };
      if (typeof input.agentId !== "string" || typeof input.text !== "string")
        return Response.json(
          { error: "agentId and text are required" },
          { status: 400 },
        );
      return Response.json(
        await client.chatkit.submitTurn({
          agentId: input.agentId,
          text: input.text,
          ...(typeof input.sessionId === "string"
            ? { sessionId: input.sessionId }
            : {}),
        }),
      );
    }
    if (request.method !== "GET") return new Response(null, { status: 405 });
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId)
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    const after =
      request.headers.get("Last-Event-ID") ??
      url.searchParams.get("afterRevision");
    if (after !== null && !/^\d+$/.test(after))
      return Response.json({ error: "Invalid cursor" }, { status: 400 });
    const abort = new AbortController();
    const stop = () => abort.abort();
    request.signal.addEventListener("abort", stop, { once: true });
    if (request.signal.aborted) stop();
    const encoder = new TextEncoder();
    const iterator = client.chatkit.streamSessionEvents({
      sessionId,
      ...(after ? { afterRevision: Number(after) } : {}),
      signal: abort.signal,
    });
    // Fetch the first frame before returning HTTP 200 so authorization errors remain errors.
    let first: Awaited<ReturnType<typeof iterator.next>>;
    try {
      first = await iterator.next();
    } catch (error) {
      stop();
      request.signal.removeEventListener("abort", stop);
      throw error;
    }
    let pending: typeof first | undefined = first;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const frame = pending ?? (await iterator.next());
          pending = undefined;
          if (frame.done) {
            controller.close();
            stop();
            request.signal.removeEventListener("abort", stop);
            return;
          }
          const value = frame.value;
          const payload =
            value.type === "event"
              ? { kind: "conversationEvent", data: value.event }
              : { kind: "cursor", revision: value.cursor };
          controller.enqueue(
            encoder.encode(
              `id: ${value.cursor}\ndata: ${JSON.stringify(payload)}\n\n`,
            ),
          );
        } catch (error) {
          controller.error(error);
          stop();
          request.signal.removeEventListener("abort", stop);
        }
      },
      async cancel() {
        stop();
        request.signal.removeEventListener("abort", stop);
        await iterator.return(undefined);
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  };
}
