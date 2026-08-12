import { describe, expect, it } from "vitest";
import { deploymentUrl, parseOptions, redact } from "./deploy-prod.js";

describe("deploy-prod", () => {
  it("parses the minimal deployment options", () => {
    expect(parseOptions(["--", "--yes", "--json"])).toEqual({ yes: true, dryRun: false, json: true });
    expect(parseOptions(["--dry-run"])).toEqual({ yes: false, dryRun: true, json: false });
    expect(() => parseOptions(["--resume"])).toThrow("Unknown deploy option");
  });

  it("redacts the Vercel token", () => {
    expect(redact("VERCEL_TOKEN=secret-value", ["secret-value"])).toBe("VERCEL_TOKEN=[REDACTED]");
  });

  it("extracts the final Vercel deployment URL", () => {
    expect(deploymentUrl("Preview: https://preview.example\nProduction: https://openbot.example\n")).toBe("https://openbot.example");
  });
});
