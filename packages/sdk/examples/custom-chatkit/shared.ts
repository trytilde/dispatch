import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createProviderRuntimeClient,
  type ProviderContext,
  type ProviderJson,
  type ProviderObject,
} from "@trytilde/sdk/chatkit-provider";
import type { ProviderStore, StoredConnection } from "./store";

export type ProviderHost = {
  store: ProviderStore;
  apiBaseUrl: string;
  webhookBaseUrl: string;
  fetch?: typeof fetch;
  mediaOrigins?: string[];
};
export function object(value: unknown): ProviderObject {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object");
  return value as ProviderObject;
}
export function string(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new Error("Required string is missing");
  return value;
}
export function form(input: ProviderObject): ProviderObject {
  const values = object(input.form_values ?? input.input ?? {});
  return object(values.configFields ?? values);
}
export function runtime(
  host: ProviderHost,
  connectionId: string,
  state: StoredConnection,
) {
  return createProviderRuntimeClient({
    baseUrl: host.apiBaseUrl,
    orgSubdomain: false,
    orgId: state.orgId,
    teamId: state.teamId,
    connectionId,
    token: state.runtimeToken,
    ...(host.fetch ? { fetch: host.fetch } : {}),
  });
}
export function stored(
  context: ProviderContext,
  runtimeToken: string,
): StoredConnection {
  return {
    orgId: context.orgId,
    teamId: context.teamId,
    runtimeToken,
    configuration: context.configuration,
    secrets: context.secrets,
  };
}
export async function platform(
  fetcher: typeof fetch,
  origin: string,
  token: string,
  method: string,
  path: string,
  body?: ProviderJson,
  key?: string,
): Promise<ProviderObject> {
  const response = await fetcher(`${origin}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (method === "DELETE" && response.status === 404) return {};
  if (!response.ok)
    throw new Error(`Platform operation failed with HTTP ${response.status}`);
  if (response.status === 204) return {};
  return object(await response.json());
}
/** Standard Webhooks and Svix sign the ID, timestamp, and exact raw body. */
export async function verifyPlatformWebhook(
  request: Request,
  secret: string,
  family: "webhook" | "svix",
): Promise<ProviderObject> {
  const id = string(request.headers.get(`${family}-id`));
  const timestamp = string(request.headers.get(`${family}-timestamp`));
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    throw new Error("Webhook timestamp outside tolerance");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.length;
        if (length > 1024 * 1024) {
          await reader.cancel();
          throw new Error("Webhook body too large");
        }
        chunks.push(item.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const body = Buffer.concat(chunks);
  const expected = createHmac(
    "sha256",
    Buffer.from(secret.replace(/^whsec_/, ""), "base64"),
  )
    .update(`${id}.${timestamp}.`)
    .update(body)
    .digest();
  const verified = (request.headers.get(`${family}-signature`) ?? "")
    .split(/\s+/)
    .some((candidate) => {
      const [version, signature] = candidate.split(",");
      if (version !== "v1" || !signature) return false;
      const bytes = Buffer.from(signature, "base64");
      return (
        bytes.length === expected.length && timingSafeEqual(bytes, expected)
      );
    });
  if (!verified) throw new Error("Invalid platform webhook signature");
  return object(JSON.parse(body.toString("utf8")));
}
/** Remove hidden email recipients recursively before returning shared tool/history data. */
export function publicMail(value: ProviderJson): ProviderJson {
  if (Array.isArray(value))
    return value
      .filter(
        (item) =>
          !(
            item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            typeof item.name === "string" &&
            item.name.toLowerCase() === "bcc"
          ),
      )
      .map(publicMail);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key.toLowerCase() !== "bcc")
        .map(([key, item]) => [key, publicMail(item)]),
    );
  return value;
}

/** Download only from provider storage origins, checking each redirect and bounding memory. */
export async function attachmentContent(
  host: ProviderHost,
  inputUrl: string,
): Promise<{ content: Uint8Array; mediaType: string }> {
  let url = new URL(inputUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const trusted =
      url.protocol === "https:" &&
      (url.hostname === "cdn.linqapp.com" ||
        url.hostname === "api.agentmail.to" ||
        /\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname) ||
        url.hostname.endsWith(".r2.cloudflarestorage.com") ||
        url.hostname.endsWith(".r2.dev"));
    if (
      url.username ||
      url.password ||
      (!trusted && !host.mediaOrigins?.includes(url.origin))
    )
      throw new Error("Attachment origin is not allowed");
    const response = await (host.fetch ?? fetch)(url, { redirect: "manual" });
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has("location")
    ) {
      await response.body?.cancel();
      url = new URL(response.headers.get("location")!, url);
      continue;
    }
    if (!response.ok || !response.body)
      throw new Error("Attachment download failed");
    const reader = response.body.getReader();
    const pieces: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 32 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Attachment exceeds 32 MiB");
        }
        pieces.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const content = new Uint8Array(size);
    let offset = 0;
    for (const piece of pieces) {
      content.set(piece, offset);
      offset += piece.length;
    }
    return {
      content,
      mediaType:
        response.headers.get("content-type") ?? "application/octet-stream",
    };
  }
  throw new Error("Too many attachment redirects");
}
