import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { ComputerAgentWorkspace, ComputerSeedFile } from "@openbot/computer-provider-core";
import { discoverAgents } from "./discovery.js";

export async function discoverAgentWorkspaces(repositoryRoot: string): Promise<readonly ComputerAgentWorkspace[]> {
  const agents = await discoverAgents(repositoryRoot);
  return Promise.all(agents.map(async (agent) => {
    const root = resolve(agent.directory, "sandbox/workspace");
    return { agentId: agent.slug, files: await filesBelow(root, root) };
  }));
}

async function filesBelow(root: string, directory: string): Promise<ComputerSeedFile[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: ComputerSeedFile[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Agent workspace symlinks are not supported: ${path}`);
    if (entry.isDirectory()) files.push(...await filesBelow(root, path));
    else if (entry.isFile()) files.push({ path: relative(root, path), content: new Uint8Array(await readFile(path)) });
  }
  return files;
}
