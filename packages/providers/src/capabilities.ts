import { createHmac } from "node:crypto";
import { ProviderError } from "@openbot/provider-sdk";

export function sandboxCapability(purpose: "box" | "desktop", sandboxId: string): string {
  const setupCode = process.env.OPENBOT_SETUP_CODE;
  if (!setupCode || setupCode.length < 16) {
    throw new ProviderError("invalid_configuration", "OPENBOT_SETUP_CODE is required to derive sandbox capabilities");
  }
  return createHmac("sha256", setupCode).update(`openbot:${purpose}:${sandboxId}`).digest("base64url");
}
