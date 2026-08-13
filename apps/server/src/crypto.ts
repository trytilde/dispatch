import { createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "openbot_session";
const cookieLifetimeSeconds = 7 * 24 * 60 * 60;

function encode(value: Uint8Array | string): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function sessionKey(setupCode: string): Buffer {
  return createHmac("sha256", setupCode).update("openbot/session/v1").digest();
}

export function matchesSetupCode(candidate: string, expected: string): boolean {
  const left = createHmac("sha256", "openbot/setup-compare/v1").update(candidate).digest();
  const right = createHmac("sha256", "openbot/setup-compare/v1").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function issueSessionCookie(setupCode: string, secure: boolean): string {
  const payload = encode(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + cookieLifetimeSeconds }),
  );
  const signature = encode(createHmac("sha256", sessionKey(setupCode)).update(payload).digest());
  return `${cookieName}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cookieLifetimeSeconds}${secure ? "; Secure" : ""}`;
}

export function hasValidSession(cookieHeader: string | null, setupCode: string): boolean {
  const token = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", sessionKey(setupCode)).update(payload).digest();
  const received = decode(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const parsed = JSON.parse(decode(payload).toString("utf8")) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
