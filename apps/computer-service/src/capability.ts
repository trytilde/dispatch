import { createHmac, timingSafeEqual } from "node:crypto";

export function validComputerCapability(authorization: string | null, expected: string): boolean {
  const candidate = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const digest = (value: string) => createHmac("sha256", "openbot/computer-capability/v1").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}
