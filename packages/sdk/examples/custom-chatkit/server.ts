import { createServer } from "node:http";
import { Readable } from "node:stream";
import { chatKitProviderEndpoint } from "@trytilde/sdk/chatkit-provider";
import { agentMailProvider } from "./agentmail";
import { linqProvider } from "./linq";
import { ProviderStore } from "./store";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
const kind = required("CHATKIT_PROVIDER");
if (kind !== "linq" && kind !== "agentmail")
  throw new Error("CHATKIT_PROVIDER must be linq or agentmail");
const publicUrl = new URL(required("PROVIDER_PUBLIC_URL"));
const store = new ProviderStore(
  required("PROVIDER_STORE_PATH"),
  Buffer.from(required("PROVIDER_STORE_KEY"), "base64"),
);
const host = {
  store,
  apiBaseUrl: required("TILDE_API_URL"),
  webhookBaseUrl: new URL("/webhooks", publicUrl).toString(),
};
const adapter = kind === "linq" ? linqProvider(host) : agentMailProvider(host);
const endpoint = chatKitProviderEndpoint({
  provider: adapter.definition,
  definitionId: required("TILDE_PROVIDER_ID"),
  signingKey: required("TILDE_PROVIDER_SIGNING_KEY"),
  endpointUrl: new URL("/provider", publicUrl).toString(),
});
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url ?? "/", publicUrl);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        outgoing.writeHead(413).end();
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === "string") headers.set(name, value);
      else if (value) for (const entry of value) headers.append(name, entry);
    }
    const request = new Request(url, {
      method: incoming.method ?? "GET",
      headers,
      ...(incoming.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
    });
    let response: Response;
    if (url.pathname === "/provider" && request.method === "GET")
      response = await endpoint.GET(request);
    else if (url.pathname === "/provider" && request.method === "POST")
      response = await endpoint.POST(request);
    else if (
      url.pathname.startsWith("/webhooks/") &&
      request.method === "POST"
    ) {
      response = await adapter.webhook(
        decodeURIComponent(url.pathname.slice("/webhooks/".length)),
        request,
      );
    } else response = new Response(null, { status: 404 });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body)
      Readable.fromWeb(
        response.body as import("node:stream/web").ReadableStream,
      ).pipe(outgoing);
    else outgoing.end();
  } catch {
    // Callback errors can contain private recipient data or credentials.
    outgoing.writeHead(500).end("Provider request failed");
  }
});
server.requestTimeout = 30_000;
server.listen(Number(process.env.PORT ?? 8787), "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
