import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  agentIdFromName,
  agentTemplateDirectory,
  scaffoldAgent,
  scaffoldAgentTemplates,
} from "./agent-scaffold.js";

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
    await scaffoldAgentTemplates(root);
    const agent = await scaffoldAgent(root, "Research Assistant");

    expect(agent).toMatchObject({ id: "research-assistant", name: "Research Assistant" });
    const directory = join(root, "configuration/agents/research-assistant");
    const agentSource = await readFile(join(directory, "agent.ts"), "utf8");
    expect(agentSource).toContain("process.env.AGENT_RESEARCH_ASSISTANT_API_KEY!");
    expect(agentSource).not.toContain("requiredEnv");
    expect(agentSource).not.toContain("runtime-providers");
    expect(agentSource).not.toContain("@tryopenbot/agent-provider");
    expect(agentSource).not.toContain("@tryopenbot/tools-provider");
    expect(agentSource).toContain("AGENT_RESEARCH_ASSISTANT_MCP_SERVER_ID");
    expect(agentSource).toContain("AGENT_RESEARCH_ASSISTANT_SKILL_REGISTRY_ID");
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

  it("loads fork-owned templates and preserves owner changes when init runs again", async () => {
    const root = await temporaryRepository();
    const templateRoot = await scaffoldAgentTemplates(root);
    const customTemplate = join(templateRoot, "lib/custom.ts.hbs");
    await mkdir(join(templateRoot, "lib"), { recursive: true });
    await writeFile(customTemplate, "export const id = {{{AGENT_ID_JSON}}};\n", "utf8");
    await writeFile(
      join(templateRoot, "instructions.ts.hbs"),
      "export default `Custom instructions for {{AGENT_NAME}}`;\n",
      "utf8",
    );

    await scaffoldAgentTemplates(root);
    await scaffoldAgent(root, "Custom Agent");

    expect(
      await readFile(join(root, "configuration/agents/custom-agent/lib/custom.ts"), "utf8"),
    ).toBe('export const id = "custom-agent";\n');
    expect(
      await readFile(join(root, "configuration/agents/custom-agent/instructions.ts"), "utf8"),
    ).toContain("Custom instructions for Custom Agent");
    expect(await readFile(customTemplate, "utf8")).toContain("AGENT_ID_JSON");
  });

  it("requires init to seed the fork-owned agent template", async () => {
    const root = await temporaryRepository();
    await expect(scaffoldAgent(root, "Missing Template")).rejects.toThrow(
      `${agentTemplateDirectory} is missing; run openbot init`,
    );
  });

  it("rejects an incomplete fork-owned agent template", async () => {
    const root = await temporaryRepository();
    const templateRoot = await scaffoldAgentTemplates(root);
    await rm(join(templateRoot, "tools/bash.ts.hbs"));

    await expect(scaffoldAgent(root, "Incomplete Agent")).rejects.toThrow(
      `${agentTemplateDirectory}/tools/bash.ts.hbs`,
    );
    await expect(access(join(root, "configuration/agents/incomplete-agent"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  });
});

async function temporaryRepository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "openbot-agent-scaffold-"));
  temporaryDirectories.push(path);
  return path;
}
