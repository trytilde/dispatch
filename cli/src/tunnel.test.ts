import { describe, expect, it } from "vite-plus/test";
import { connectionHints, tunnelArguments } from "./tunnel.js";

describe("tunnelArguments", () => {
  it("forwards both screens, metro, and adb by default", () => {
    expect(tunnelArguments({ ssh: "root@h", platform: "linux" })).toEqual([
      "-N",
      "-L",
      "5900:127.0.0.1:5900",
      "-L",
      "5901:127.0.0.1:5901",
      "-L",
      "8081:127.0.0.1:8081",
      "-L",
      "5555:127.0.0.1:5555",
      "root@h",
    ]);
  });

  it("honors per-host ports and disabled forwards", () => {
    const args = tunnelArguments(
      { ssh: "root@h", platform: "linux", vncPort: 5905 },
      { adb: false, metro: false, desktop: false },
    );
    expect(args).toEqual(["-N", "-L", "5905:127.0.0.1:5905", "root@h"]);
  });
});

describe("connectionHints", () => {
  it("labels a mac remote's native screen sharing", () => {
    const hints = connectionHints({ ssh: "me@mini", platform: "mac" });
    expect(hints[0]).toContain("Screen Sharing");
    // emulator screen, desktop screen, metro, adb
    expect(hints).toHaveLength(4);
  });
});

describe("desktop screen forwarding", () => {
  it("forwards the Electron screen on its own port so both screens can run", () => {
    const args = tunnelArguments({ ssh: "root@h", platform: "linux" });
    expect(args).toContain("5900:127.0.0.1:5900");
    expect(args).toContain("5901:127.0.0.1:5901");
  });

  it("honors a per-host desktop port and can be disabled", () => {
    expect(tunnelArguments({ ssh: "root@h", platform: "linux", desktopVncPort: 5911 })).toContain(
      "5911:127.0.0.1:5911",
    );
    expect(tunnelArguments({ ssh: "root@h", platform: "linux" }, { desktop: false })).not.toContain(
      "5901:127.0.0.1:5901",
    );
  });

  it("labels the emulator and desktop screens distinctly", () => {
    const hints = connectionHints({ ssh: "root@h", platform: "linux" });
    expect(hints.some((hint) => hint.startsWith("emulator:"))).toBe(true);
    expect(hints.some((hint) => hint.startsWith("desktop:"))).toBe(true);
  });
});
