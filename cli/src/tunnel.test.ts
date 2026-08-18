import { describe, expect, it } from "vite-plus/test";
import { connectionHints, tunnelArguments } from "./tunnel.js";

describe("tunnelArguments", () => {
  it("forwards vnc, metro, and adb by default", () => {
    expect(tunnelArguments({ ssh: "root@h", platform: "linux" })).toEqual([
      "-N",
      "-L",
      "5900:127.0.0.1:5900",
      "-L",
      "8081:127.0.0.1:8081",
      "-L",
      "5555:127.0.0.1:5555",
      "root@h",
    ]);
  });

  it("honors per-host ports and disabled forwards", () => {
    const args = tunnelArguments(
      { ssh: "root@h", platform: "linux", vncPort: 5901 },
      { adb: false, metro: false },
    );
    expect(args).toEqual(["-N", "-L", "5901:127.0.0.1:5901", "root@h"]);
  });
});

describe("connectionHints", () => {
  it("labels a mac remote's native screen sharing", () => {
    const hints = connectionHints({ ssh: "me@mini", platform: "mac" });
    expect(hints[0]).toContain("Screen Sharing");
    expect(hints).toHaveLength(3);
  });
});
