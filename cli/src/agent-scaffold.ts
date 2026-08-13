import { access, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeFileTemplate } from "@tryopenbot/utilities";

const agentTemplates = [
  ["agent.ts", "./assets/agents/hello-world/agent.ts.hbs"],
  ["instructions.ts", "./assets/agents/hello-world/instructions.ts.hbs"],
  ["instrumentation.ts", "./assets/agents/hello-world/instrumentation.ts.hbs"],
  ["lib/identity.ts", "./assets/agents/hello-world/lib/identity.ts.hbs"],
  ["tools/await_shell.ts", "./assets/agents/hello-world/tools/await_shell.ts.hbs"],
  ["tools/bash.ts", "./assets/agents/hello-world/tools/bash.ts.hbs"],
  ["tools/copy_from_computer.ts", "./assets/agents/hello-world/tools/copy_from_computer.ts.hbs"],
  ["tools/copy_to_computer.ts", "./assets/agents/hello-world/tools/copy_to_computer.ts.hbs"],
  ["tools/glob.ts", "./assets/agents/hello-world/tools/glob.ts.hbs"],
  ["tools/grep.ts", "./assets/agents/hello-world/tools/grep.ts.hbs"],
  ["tools/read_file.ts", "./assets/agents/hello-world/tools/read_file.ts.hbs"],
  ["tools/screenshot.ts", "./assets/agents/hello-world/tools/screenshot.ts.hbs"],
  ["tools/write_file.ts", "./assets/agents/hello-world/tools/write_file.ts.hbs"],
  ["skills/create-agent/SKILL.md", "./assets/agents/hello-world/skills/create-agent/SKILL.md.hbs"],
  ["skills/hello-world/SKILL.md", "./assets/agents/hello-world/skills/hello-world/SKILL.md.hbs"],
  ["sandbox/workspace/.profile", "./assets/agents/hello-world/sandbox/workspace/.profile.hbs"],
  ["sandbox/workspace/README.md", "./assets/agents/hello-world/sandbox/workspace/README.md.hbs"],
] as const;

export interface ScaffoldedAgent {
  id: string;
  name: string;
  directory: string;
}

export function agentIdFromName(name: string): string {
  const id = name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id) throw new Error("Agent name must contain at least one letter or number");
  return id;
}

/** Materialize one complete authored agent without overwriting an existing directory. */
export async function scaffoldAgent(
  repositoryRoot: string,
  rawName: string,
  options: { existing?: "error" | "preserve" } = {},
): Promise<ScaffoldedAgent> {
  const name = rawName.trim();
  if (!name) throw new Error("Agent name is required");
  const id = agentIdFromName(name);
  const directory = resolve(repositoryRoot, "configuration/agents", id);
  if (await exists(directory)) {
    if (options.existing === "preserve") return { id, name, directory };
    throw new Error(`Agent ${id} already exists`);
  }

  const values = {
    AGENT_ID: id,
    AGENT_ID_JSON: JSON.stringify(id),
    AGENT_NAME: name,
    AGENT_NAME_JSON: JSON.stringify(name),
    AGENT_ENV_PREFIX: id.replace(/-/g, "_").toUpperCase(),
  };
  try {
    for (const [relativePath, template] of agentTemplates) {
      await materializeFileTemplate(
        fileURLToPath(new URL(template, import.meta.url)),
        resolve(directory, relativePath),
        values,
        { flag: "wx", mode: 0o600 },
      );
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { id, name, directory };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
