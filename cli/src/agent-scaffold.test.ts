import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { agentIdFromName, scaffoldAgent } from "./agent-scaffold.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("agent scaffolding", () => {
  it("derives a stable path id from the entered name", () => {
    expect(agentIdFromName("  Café Research  ")).toBe("cafe-research");
    expect(() => agentIdFromName("---")).toThrow("letter or number");
  });

  it("materializes the supported agent tree with fixed-id shared computer tools", async () => {
    const root = await temporaryRepository();
    const agent = await scaffoldAgent(root, "Research Assistant");

    expect(agent).toMatchObject({ id: "research-assistant", name: "Research Assistant" });
    const directory = join(root, "configuration/agents/research-assistant");
    expect(await readFile(join(directory, "agent.ts"), "utf8")).toContain(
      "AGENT_RESEARCH_ASSISTANT_API_KEY",
    );
    expect(await readFile(join(directory, "lib/identity.ts"), "utf8")).toContain(
      '"Research Assistant"',
    );
    expect(await readFile(join(directory, "tools/bash.ts"), "utf8")).toContain(
      'createBashTool({ agentId: "research-assistant" })',
    );
    expect(await readFile(join(directory, "tools/await_shell.ts"), "utf8")).toContain(
      "createAwaitShellTool",
    );
    expect(await readFile(join(directory, "tools/screenshot.ts"), "utf8")).toContain(
      "createScreenshotTool",
    );
    expect(await readFile(join(directory, "tools/copy_from_computer.ts"), "utf8")).toContain(
      "createCopyFromComputerTool",
    );
    expect(await readFile(join(directory, "tools/copy_to_computer.ts"), "utf8")).toContain(
      "createCopyToComputerTool",
    );
    expect(await readFile(join(directory, "skills/create-agent/SKILL.md"), "utf8")).toContain(
      'pnpm openbot new-agent "<display name>"',
    );
    await expect(access(join(directory, "tools/hello-world.ts"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(scaffoldAgent(root, "Research Assistant")).rejects.toThrow("already exists");
    await expect(
      scaffoldAgent(root, "Research Assistant", { existing: "preserve" }),
    ).resolves.toMatchObject({ id: "research-assistant" });
  });
});

async function temporaryRepository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "openbot-agent-scaffold-"));
  temporaryDirectories.push(path);
  return path;
}
