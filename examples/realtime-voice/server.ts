import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@trytilde/sdk";
import { chatKitEndpoint, convertToAiSdkMessages } from "@trytilde/sdk-vercel-ai-node";
import { convertToModelMessages, streamText } from "ai";

type Registration = {
  agent: { id: string };
  apiKey: string;
  webhookSigningKey: string;
};
const registrations: Record<string, Registration> = JSON.parse(
  await readFile(new URL(".agents.local.json", import.meta.url), "utf8"),
);
const port = Number(process.env.PORT ?? 31247);
const owner = createClient({
  baseUrl: process.env.TILDE_BASE_URL,
  orgId: process.env.TILDE_ORG_ID,
  teamId: process.env.TILDE_TEAM_ID,
  apiKey: process.env.TILDE_API_KEY,
});
const model = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(
  process.env.TEXT_MODEL ?? "gpt-4.1-mini",
);
const handlers = new Map<string, ReturnType<typeof chatKitEndpoint>>(
  Object.entries(registrations).map(([mode, registration]) => {
    const client = createClient({
      baseUrl: process.env.TILDE_BASE_URL,
      orgId: process.env.TILDE_ORG_ID,
      teamId: process.env.TILDE_TEAM_ID,
      apiKey: registration.apiKey,
    });
    return [
      `/agent/${mode}`,
      chatKitEndpoint({
        client,
        webhookSigningKey: registration.webhookSigningKey,
        responseMode: "agentLoop",
        async handler(request, context) {
          // This is the normal callback. Rust has already transcribed the caller.
          console.log("Text turn", {
            audio: context.audio?.mode,
            carrier: context.telnyx ? "telnyx" : "browser-or-text",
          });
          const history = await context.session.history();
          const messages = await convertToAiSdkMessages({
            messages: [...history.items, ...context.messages],
          });
          return streamText({
            model,
            messages: await convertToModelMessages(messages),
            system: context.audio
              ? "You are a voice test assistant. Use one short spoken sentence; no markdown."
              : "You are a helpful assistant.",
            abortSignal: request.signal,
          }).toUIMessageStreamResponse();
        },
      }),
    ] as const;
  }),
);

/** Serve the local manual tester and signed agent endpoints without exposing API keys. */
const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://localhost:${port}`;
    const url = new URL(incoming.url ?? "/", origin);
    if (url.pathname === "/") {
      outgoing.setHeader("content-type", "text/html; charset=utf-8");
      outgoing.end(await readFile(new URL("index.html", import.meta.url)));
      return;
    }
    if (url.pathname === "/start" && incoming.method === "POST") {
      // Local test UI only. Reject cross-site requests to the owner-authorized bootstrap.
      if (
        incoming.headers.origin !== origin &&
        incoming.headers.origin !== `http://127.0.0.1:${port}`
      ) {
        outgoing.writeHead(403).end();
        return;
      }
      const registration = registrations[url.searchParams.get("mode") ?? "pipeline"];
      if (!registration) {
        outgoing.writeHead(400).end();
        return;
      }
      const result = await owner.chatkit.audio.start({
        agentId: registration.agent.id,
      });
      const media = new URL(result.websocketPath, process.env.TILDE_BASE_URL);
      media.protocol = media.protocol === "https:" ? "wss:" : "ws:";
      outgoing.setHeader("content-type", "application/json");
      outgoing.end(JSON.stringify({ ...result, websocketUrl: media.toString() }));
      return;
    }
    const handler = handlers.get(url.pathname);
    if (!handler || incoming.method !== "POST") {
      outgoing.writeHead(404).end();
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    }
    const controller = new AbortController();
    outgoing.on("close", () => controller.abort());
    const request = new Request(url, {
      method: "POST",
      headers,
      body: Readable.toWeb(incoming) as ReadableStream,
      signal: controller.signal,
      duplex: "half",
    } as RequestInit);
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body)
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Request failed");
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end("Request failed; inspect server output.");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Voice test UI: http://localhost:${port}`));
