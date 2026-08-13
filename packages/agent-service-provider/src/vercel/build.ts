import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsdown";
import type { DeploymentContext, DeploymentResult } from "@openbot/runtime-provider-core";
import { bundleOptions, renderTemplate } from "../build.js";
import { discoverAgents, type AgentSource } from "../discovery.js";

export const agentVercelArtifact = ".openbot-deploy/vercel/agents";
const agentTemplate = fileURLToPath(new URL("./assets/agent-entry.ts", import.meta.url));
const healthSource = fileURLToPath(new URL("./assets/health.ts", import.meta.url));
const functionConfig = fileURLToPath(new URL("./assets/function-config.json", import.meta.url));
const outputConfig = fileURLToPath(new URL("./assets/output-config.json", import.meta.url));
export const vercelProjectConfig = fileURLToPath(new URL("./assets/vercel.json", import.meta.url));

export async function buildVercelAgentService(context: DeploymentContext): Promise<DeploymentResult> {
  const agents = await discoverAgents(context.repositoryRoot);
  const root = resolve(context.repositoryRoot, agentVercelArtifact);
  const output = resolve(root, ".vercel/output");
  const generated = resolve(context.repositoryRoot, ".openbot-deploy/generated/vercel-agents");
  await rm(generated, { recursive: true, force: true });
  await mkdir(generated, { recursive: true });
  const sharedDigest = await digestSharedInputs(context.repositoryRoot);
  const digests = new Map(await Promise.all(agents.map(async (agent) => [agent.slug, await digestAgent(agent, sharedDigest)] as const)));
  await removeDeletedAgentFunctions(output, new Set(agents.map((agent) => agent.slug)));
  let changed = 0;
  const builds = agents.map(async (agent) => {
    const wrapper = resolve(generated, `${agent.slug}.ts`);
    const functionDirectory = resolve(output, `functions/api/agents/${agent.slug}.func`);
    const digest = digests.get(agent.slug)!;
    if (await readOptional(resolve(functionDirectory, ".openbot-digest")) === digest && await readOptional(resolve(functionDirectory, "index.mjs"))) return;
    changed += 1;
    await rm(functionDirectory, { recursive: true, force: true });
    await mkdir(functionDirectory, { recursive: true });
    await writeFile(wrapper, await renderTemplate(agentTemplate, { AGENT_SOURCE: JSON.stringify(agent.path) }));
    await build(bundleOptions(context.repositoryRoot, wrapper, functionDirectory, "index.mjs", true));
    await Promise.all([
      copyFile(functionConfig, resolve(functionDirectory, ".vc-config.json")),
      writeFile(resolve(functionDirectory, ".openbot-digest"), digest),
    ]);
  });
  const healthDirectory = resolve(output, "functions/healthz.func");
  await mkdir(healthDirectory, { recursive: true });
  builds.push((async () => {
    if (await readOptional(resolve(healthDirectory, "index.mjs"))) return;
    await build(bundleOptions(context.repositoryRoot, healthSource, healthDirectory, "index.mjs", true));
    await copyFile(functionConfig, resolve(healthDirectory, ".vc-config.json"));
  })());
  await Promise.all(builds);
  await copyFile(outputConfig, resolve(output, "config.json"));
  return { outputs: { "agent-service.artifact": root, "agent-service.count": String(agents.length), "agent-service.changed-count": String(changed), "agent-service.digest": digestValues(digests) } };
}

async function digestAgent(agent: AgentSource, sharedDigest: string): Promise<string> { return createHash("sha256").update(agent.slug).update(await readFile(agent.path)).update(sharedDigest).digest("hex"); }
function digestValues(values: ReadonlyMap<string, string>): string { const hash = createHash("sha256"); for (const [name, value] of [...values].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update(value); return hash.digest("hex"); }
async function digestSharedInputs(repositoryRoot: string): Promise<string> {
  const files = [resolve(repositoryRoot, "package.json"), resolve(repositoryRoot, "pnpm-lock.yaml"), ...await sourceFiles(resolve(repositoryRoot, "packages"))].sort();
  const hash = createHash("sha256");
  for (const file of files) { const value = await readOptional(file); if (value !== undefined) hash.update(relative(repositoryRoot, file)).update(value); }
  return hash.digest("hex");
}
async function sourceFiles(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? sourceFiles(resolve(directory, entry.name)) : [resolve(directory, entry.name)]));
  return nested.flat().filter((file) => /(?:\.tsx?|package\.json)$/.test(file));
}
async function readOptional(path: string): Promise<string | undefined> { try { return await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; } }
async function removeDeletedAgentFunctions(output: string, current: ReadonlySet<string>): Promise<void> {
  const directory = resolve(output, "functions/api/agents");
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name.endsWith(".func") && !current.has(entry.name.slice(0, -5))).map((entry) => rm(resolve(directory, entry.name), { recursive: true, force: true })));
}
