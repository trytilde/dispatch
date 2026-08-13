import { readdir } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

export interface AgentSource { slug: string; path: string }

export async function discoverAgents(repositoryRoot: string): Promise<readonly AgentSource[]> {
  const directory = resolve(repositoryRoot, "configuration/agents");
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && [".ts", ".mts"].includes(extname(entry.name)))
    .map((entry) => ({ slug: basename(entry.name, extname(entry.name)), path: resolve(directory, entry.name) }))
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map((agent) => {
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agent.slug)) throw new Error(`Invalid agent filename: ${agent.slug}`);
      return agent;
    });
}
