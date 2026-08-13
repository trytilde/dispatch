export function setupCode(): string {
  const code = process.env.OPENBOT_SETUP_CODE;
  if (!code || code.length < 20) {
    throw new Error("OPENBOT_SETUP_CODE must contain at least 20 characters");
  }
  return code;
}

export function publicOrigin(request?: Request): string {
  if (process.env.OPENBOT_PUBLIC_ORIGIN)
    return process.env.OPENBOT_PUBLIC_ORIGIN.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return `http://127.0.0.1:${process.env.OPENBOT_PORT ?? "4100"}`;
}
