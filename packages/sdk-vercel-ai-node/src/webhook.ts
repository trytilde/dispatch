import { createHmac, timingSafeEqual } from "node:crypto";
import type { JsonValue } from "@trytilde/sdk";

export const TILDE_WEBHOOK_ID_HEADER = "x-tilde-webhook-id";
export const TILDE_WEBHOOK_TIMESTAMP_HEADER = "x-tilde-timestamp";
export const TILDE_WEBHOOK_SIGNATURE_HEADER = "x-tilde-signature";
export const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Environment value that maps to the explicit-null signing key: `AGENT_<ID>_WEBHOOK_SIGNING_KEY=null`.
 */
export const UNSIGNED_WEBHOOK_ENV_VALUE = "null";

export type VerifyWebhookOptions = {
  /**
   * HMAC key issued by Tilde for this endpoint. Pass `null` explicitly to accept unsigned
   * invocations: verification is skipped entirely and the SDK warns once per process. An
   * `undefined` or empty key keeps verification required and rejects every request.
   */
  webhookSigningKey: string | null;
  toleranceSeconds?: number;
};

export type VerifiedWebhookRequest = {
  rawBody: Uint8Array;
  json: JsonValue;
  webhookId: string;
  timestamp: number;
};

export type VerifiedWebhookSignature = Omit<VerifiedWebhookRequest, "json">;

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export async function verifyWebhookRequest(
  request: Request,
  options: VerifyWebhookOptions,
): Promise<VerifiedWebhookRequest> {
  const verified = await verifyWebhookSignature(request, options);

  let json: JsonValue;
  try {
    json = JSON.parse(new TextDecoder().decode(verified.rawBody)) as JsonValue;
  } catch {
    throw new WebhookVerificationError("Invalid JSON body");
  }

  return {
    ...verified,
    json,
  };
}

export async function verifyWebhookSignature(
  request: Request,
  options: VerifyWebhookOptions,
): Promise<VerifiedWebhookSignature> {
  if (options.webhookSigningKey === null) {
    warnUnsignedWebhooksOnce();
    return unsignedWebhook(request);
  }
  if (!options.webhookSigningKey) {
    throw new WebhookVerificationError("webhookSigningKey is required");
  }

  const webhookId = requiredHeader(request, TILDE_WEBHOOK_ID_HEADER);
  const timestampHeader = requiredHeader(request, TILDE_WEBHOOK_TIMESTAMP_HEADER);
  const signature = requiredHeader(request, TILDE_WEBHOOK_SIGNATURE_HEADER);
  const timestamp = parseTimestamp(timestampHeader);
  assertFreshTimestamp(timestamp, options.toleranceSeconds);

  const rawBody = new Uint8Array(await request.arrayBuffer());
  const expected = signBody(options.webhookSigningKey, timestamp, rawBody);
  if (!signatureMatches(signature, expected)) {
    throw new WebhookVerificationError("Invalid webhook signature");
  }

  return {
    rawBody,
    webhookId,
    timestamp,
  };
}

export function signBody(
  webhookSigningKey: string,
  timestamp: number,
  rawBody: Uint8Array,
): string {
  const hmac = createHmac("sha256", webhookSigningKey);
  hmac.update(String(timestamp));
  hmac.update(".");
  hmac.update(rawBody);
  return `hmac-sha256=${hmac.digest("hex")}`;
}

/**
 * Map the `AGENT_<ID>_WEBHOOK_SIGNING_KEY` environment convention to a signing-key option: the
 * literal value `null` (surrounding whitespace ignored) becomes the explicit `null` that skips
 * verification; any other value is used as the key. A missing or blank variable yields an empty
 * key, which keeps verification required and rejects every request, so verification is never
 * skipped by accident.
 */
export function webhookSigningKeyFromEnv(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === UNSIGNED_WEBHOOK_ENV_VALUE) return null;
  return trimmed === "" ? "" : (value ?? "");
}

let warnedUnsignedWebhooks = false;

/** Log once per process that an endpoint accepts unsigned invocations. */
export function warnUnsignedWebhooksOnce(): void {
  if (warnedUnsignedWebhooks) return;
  warnedUnsignedWebhooks = true;
  console.warn(
    "[@trytilde/sdk-vercel-ai-node] webhookSigningKey is null: this endpoint accepts unsigned " +
      "invocations and skips Tilde webhook signature verification.",
  );
}

/** @internal Test hook so the once-per-process warning can be asserted in isolation. */
export function resetUnsignedWebhookWarningForTests(): void {
  warnedUnsignedWebhooks = false;
}

async function unsignedWebhook(request: Request): Promise<VerifiedWebhookSignature> {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  return {
    rawBody,
    webhookId: request.headers.get(TILDE_WEBHOOK_ID_HEADER) || `unsigned-${crypto.randomUUID()}`,
    timestamp: optionalTimestamp(request.headers.get(TILDE_WEBHOOK_TIMESTAMP_HEADER)),
  };
}

/** Best-effort timestamp for unsigned invocations: the header when well-formed, otherwise now. */
function optionalTimestamp(header: string | null): number {
  if (header !== null) {
    try {
      return parseTimestamp(header);
    } catch {
      // Unsigned invocations are never rejected for a malformed timestamp.
    }
  }
  return Math.floor(Date.now() / 1000);
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name);
  if (!value) {
    throw new WebhookVerificationError(`Missing ${name} header`);
  }
  return value;
}

function parseTimestamp(value: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new WebhookVerificationError("Invalid webhook timestamp");
  }
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp)) {
    throw new WebhookVerificationError("Invalid webhook timestamp");
  }
  return timestamp;
}

function assertFreshTimestamp(
  timestamp: number,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): void {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    throw new WebhookVerificationError("Webhook timestamp is outside tolerance");
  }
}

function signatureMatches(signature: string, expected: string): boolean {
  if (!signature.startsWith("hmac-sha256=")) {
    throw new WebhookVerificationError("Invalid webhook signature format");
  }

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
