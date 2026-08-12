import { createHmac } from "node:crypto";

export function scopedCapability(scope: "computer" | "vnc", computerId: string, secret = process.env.OPENBOT_COMPUTER_CAPABILITY_SECRET): string {
  if (!secret || secret.length < 32) throw new Error("OPENBOT_COMPUTER_CAPABILITY_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(`openbot:${scope}:${computerId}`).digest("base64url");
}
