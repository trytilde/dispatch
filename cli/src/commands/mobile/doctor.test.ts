import { describe, expect, it, vi } from "vite-plus/test";
import { runDoctor } from "./doctor.js";

async function captureDoctor(): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  const code = await runDoctor();
  log.mockRestore();
  return { code, lines };
}

describe("runDoctor", () => {
  it("prints one prefixed line per check and a matching summary", async () => {
    const { code, lines } = await captureDoctor();
    for (const line of lines.slice(0, -1)) expect(line).toMatch(/^(ok|warn|FAIL) /);
    const summary = lines.at(-1) ?? "";
    if (code === 0) expect(summary).toMatch(/all checks passed|nothing blocking/);
    else expect(summary).toMatch(/check\(s\) failed/);
  });

  it("reports the Java compiler rather than the runtime", async () => {
    const { lines } = await captureDoctor();
    const jdk = lines.find((line) => line.includes("jdk"));
    expect(jdk).toMatch(/javac|install a full JDK/);
  });

  it("names the remedy on a failing Android tool check", async () => {
    const { lines } = await captureDoctor();
    for (const line of lines.filter((entry) => entry.startsWith("FAIL")))
      if (/android-sdk|adb|emulator|avdmanager/.test(line))
        expect(line).toContain("openbot mobile setup");
  });
});
