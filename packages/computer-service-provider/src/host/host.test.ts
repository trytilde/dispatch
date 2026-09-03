import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { HostComputerProvider, type HostComputerCommandRunner } from "./index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("HostComputerProvider", () => {
  it("installs one host service with its bearer key only in a private environment file", async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), "dispatch-host-computer-"));
    temporaryDirectories.push(homeDirectory);
    const calls: string[][] = [];
    const runner: HostComputerCommandRunner = {
      async run(_command, args) {
        calls.push([...args]);
        return {
          stdout: args.includes("is-active") ? "active\n" : "",
          stderr: "",
        };
      },
    };
    const provider = new HostComputerProvider({ homeDirectory, runner });

    const handle = await provider.create(
      { id: "dispatch-computer" },
      {
        requestId: "create",
        environment: { COMPUTER_SERVICE_API_KEY: "a".repeat(32) },
      },
    );

    expect(handle.state).toBe("running");
    expect(calls.flat().join(" ")).not.toContain("a".repeat(32));
    expect(await readFile(join(homeDirectory, ".dispatch/computer/environment"), "utf8")).toContain(
      `COMPUTER_SERVICE_API_KEY="${"a".repeat(32)}"`,
    );
    expect(
      await readFile(join(homeDirectory, ".config/systemd/user/dispatch-computer.service"), "utf8"),
    ).toContain("ExecStart=/usr/local/bin/start-dispatch-computer");
  });
});
