import { access, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface AgentSource {
  slug: string;
  directory: string;
  path: string;
  instrumentationPath?: string;
}

export const requiredComputerToolFiles = [
  "bash.ts",
  "glob.ts",
  "grep.ts",
  "read_file.ts",
  "write_file.ts",
] as const;

export async function discoverAgents(repositoryRoot: string): Promise<readonly AgentSource[]> {
  const directory = resolve(repositoryRoot, "configuration/agents");
  const entries = await readdir(directory, { withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const agentDirectory = resolve(directory, entry.name);
      const path = resolve(agentDirectory, "agent.ts");
      await access(path);
      await Promise.all(requiredComputerToolFiles.map((name) => access(resolve(agentDirectory, "tools", name))));
      const instrumentationPath = resolve(agentDirectory, "instrumentation.ts");
      return {
        slug: entry.name,
        directory: agentDirectory,
        path,
        ...(await exists(instrumentationPath) ? { instrumentationPath } : {}),
      };
    }))
    .then((agents) => agents
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((agent) => {
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agent.slug)) throw new Error(`Invalid agent directory: ${agent.slug}`);
      return agent;
    }));
}

export function globalInstrumentationPath(repositoryRoot: string): string {
  return resolve(repositoryRoot, "configuration/instrumentation.ts");
}

export async function agentTypeScriptPaths(agent: AgentSource): Promise<readonly string[]> {
  return filesBelow(agent.directory, (path) => /\.tsx?$/.test(path));
}

async function filesBelow(directory: string, include: (path: string) => boolean): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Agent source symlinks are not supported: ${path}`);
    if (entry.isDirectory()) return filesBelow(path, include);
    return entry.isFile() && include(path) ? [path] : [];
  }));
  return nested.flat().sort();
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
