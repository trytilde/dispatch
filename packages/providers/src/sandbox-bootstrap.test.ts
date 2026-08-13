import { describe, expect, it } from "vite-plus/test";
import {
  CHROME_SHA256_AMD64,
  CHROME_VERSION_AMD64,
  CUA_DRIVER_VERSION,
  desktopBootstrapScript,
  desktopStartScript,
} from "./sandbox-bootstrap.js";

describe("desktop sandbox bootstrap", () => {
  it("pins browser and computer driver artifacts", () => {
    expect(CHROME_VERSION_AMD64).toMatch(/^\d+\.\d+\.\d+\.\d+-\d+$/);
    expect(CHROME_SHA256_AMD64).toMatch(/^[a-f0-9]{64}$/);
    expect(CUA_DRIVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(desktopBootstrapScript).toContain(`CUA_DRIVER_VERSION="${CUA_DRIVER_VERSION}"`);
    expect(desktopBootstrapScript).toContain(`CHROME_SHA256_AMD64="${CHROME_SHA256_AMD64}"`);
    expect(desktopBootstrapScript).toContain("cua-driver --version >/dev/null");
    expect(desktopBootstrapScript).toContain("/usr/local/bin/openbot-cua-driver");
  });

  it("requires a desktop capability before exposing noVNC", () => {
    expect(desktopStartScript).toContain("OPENBOT_DESKTOP_CAPABILITY is required");
    expect(desktopStartScript).toContain("--token-plugin TokenFile");
    expect(desktopStartScript).toContain("CUA_DRIVER_SOCKET=/tmp/openbot-cua-driver.sock");
    expect(desktopStartScript).toContain("getent passwd 1000");
    expect(desktopStartScript).toContain('"$CUA_EXECUTABLE" serve --socket "$CUA_DRIVER_SOCKET"');
    expect(desktopStartScript).toContain("--dangerously-bypass-approvals");
    expect(desktopStartScript).toContain("/proc/sys/kernel/random/boot_id");
    expect(desktopStartScript).toContain('kill -0 "$locked_pid"');
    expect(desktopStartScript).toContain("has not published its owner yet");
    expect(desktopStartScript).not.toContain("0.0.0.0:5901");
  });
});
