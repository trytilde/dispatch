import { describe, expect, it } from "vite-plus/test";
import { hasValidSession, issueSessionCookie, matchesSetupCode } from "./crypto.js";

describe("installation cryptography", () => {
  const code = "a-long-setup-code-with-enough-entropy";

  it("compares setup codes without comparing raw variable length buffers", () => {
    expect(matchesSetupCode(code, code)).toBe(true);
    expect(matchesSetupCode("wrong", code)).toBe(false);
  });

  it("issues verifiable expiring sessions", () => {
    const cookie = issueSessionCookie(code, false).split(";")[0] ?? "";
    expect(hasValidSession(cookie, code)).toBe(true);
    expect(hasValidSession(cookie, "different-code")).toBe(false);
  });
});
