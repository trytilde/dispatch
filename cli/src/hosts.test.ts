import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { loadHosts, resolveHost } from "./hosts.js";

describe("loadHosts", () => {
  it("returns empty when no configuration exists", () => {
    expect(loadHosts(mkdtempSync(join(tmpdir(), "devcli-")))).toEqual({});
  });

  it("reads fork-owned hosts from configuration/dev-hosts.json", () => {
    const root = mkdtempSync(join(tmpdir(), "devcli-"));
    mkdirSync(join(root, "configuration"));
    writeFileSync(
      join(root, "configuration", "dev-hosts.json"),
      JSON.stringify({
        hosts: { build: { ssh: "root@198.51.100.7", platform: "linux", path: "~/dispatch" } },
      }),
    );
    expect(loadHosts(root).build?.ssh).toBe("root@198.51.100.7");
  });
});

describe("resolveHost", () => {
  it("prefers a named host", () => {
    const host = resolveHost("build", { build: { ssh: "root@198.51.100.7", platform: "mac" } });
    expect(host.platform).toBe("mac");
  });

  it("treats an unknown name as a raw ssh destination", () => {
    expect(resolveHost("me@203.0.113.9", {})).toEqual({ ssh: "me@203.0.113.9", platform: "linux" });
  });

  it("rejects flag-like arguments", () => {
    expect(() => resolveHost("--print", {})).toThrow(/Unknown host/);
  });
});
