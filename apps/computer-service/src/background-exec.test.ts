import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { BackgroundExecRegistry } from "./background-exec.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

async function registry(): Promise<BackgroundExecRegistry> {
  const root = await mkdtemp(join(tmpdir(), "openbot-background-jobs-"));
  roots.push(root);
  return new BackgroundExecRegistry(root);
}

describe("BackgroundExecRegistry", () => {
  it("captures output and waits for a background command", async () => {
    const jobs = await registry();
    const started = await jobs.start(
      "hello-world",
      {
        command: process.execPath,
        arguments: ["-e", "setTimeout(() => { console.log('done') }, 20)"],
        cwd: process.cwd(),
        environment: { ...process.env } as Record<string, string>,
      },
      1_000,
    );

    expect(started.running).toBe(true);
    const completed = await new BackgroundExecRegistry(jobs.stateRoot).wait(
      "hello-world",
      started.jobId,
      1_000,
      new AbortController().signal,
    );
    expect(completed).toMatchObject({ exitCode: 0, running: false, stdout: "done\n" });
  });

  it("does not expose one agent's job to another agent", async () => {
    const jobs = await registry();
    const started = await jobs.start(
      "alpha",
      {
        command: process.execPath,
        arguments: ["-e", "setTimeout(() => {}, 20)"],
        cwd: process.cwd(),
        environment: { ...process.env } as Record<string, string>,
      },
      1_000,
    );

    await expect(
      jobs.wait("beta", started.jobId, 1, new AbortController().signal),
    ).rejects.toMatchObject({ rawMessage: "Background shell job not found" });
  });
});
