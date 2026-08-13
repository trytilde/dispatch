import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { LifecyclePhase } from "@openbot/computer-service-proto";
import { lifecycleBundleDigest } from "./lifecycle.js";

describe("lifecycleBundleDigest", () => {
  it("is stable across input order and changes with file content", () => {
    const file = (path: string, content: string) => ({
      $typeName: "openbot.computer.v1.LifecycleFile" as const,
      path,
      content: new TextEncoder().encode(content),
      mode: 0o755,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    const script = {
      $typeName: "openbot.computer.v1.LifecycleScript" as const,
      id: "start",
      path: "start.sh",
      phases: [LifecyclePhase.CREATE],
    };
    const left = lifecycleBundleDigest({
      files: [file("b.sh", "b"), file("a.sh", "a")],
      scripts: [script],
    });
    const right = lifecycleBundleDigest({
      files: [file("a.sh", "a"), file("b.sh", "b")],
      scripts: [script],
    });
    expect(left).toBe(right);
    expect(lifecycleBundleDigest({ files: [file("a.sh", "changed")], scripts: [script] })).not.toBe(
      left,
    );
  });
});
