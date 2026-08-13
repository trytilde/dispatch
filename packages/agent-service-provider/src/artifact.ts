import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsdown";
import type { DeploymentContext, DeploymentResult } from "@openbot/runtime-provider-core";
import type { CommandRunner } from "@openbot/control-service-provider";
import { discoverAgents, type AgentSource } from "./discovery.js";

export const agentLocalArtifact = ".openbot-deploy/agent-service/server.js";
export const agentVercelArtifact = ".openbot-deploy/vercel/agents";

export async function checkAgentService(context: DeploymentContext, runner: CommandRunner): Promise<void> {
  const agents = await discoverAgents(context.repositoryRoot);
  const config = resolve(context.repositoryRoot, ".openbot-deploy/generated/agents.tsconfig.json");
  await mkdir(dirname(config), { recursive: true });
  await writeFile(config, `${JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { noEmit: true }, files: agents.map((agent) => relative(dirname(config), agent.path)) }, null, 2)}\n`);
  await runner.run("pnpm", ["exec", "tsgo", "-p", config, "--noEmit"], { cwd: context.repositoryRoot, environment: context.environment });
}

export async function buildLocalAgentService(context: DeploymentContext): Promise<DeploymentResult> {
  const agents = await discoverAgents(context.repositoryRoot);
  const generated = resolve(context.repositoryRoot, ".openbot-deploy/generated/local-agent-service.ts");
  await mkdir(dirname(generated), { recursive: true });
  await writeFile(generated, localServerSource(agents));
  const outDir = resolve(context.repositoryRoot, dirname(agentLocalArtifact));
  await build(bundleOptions(context.repositoryRoot, generated, outDir, "server.js", false));
  return { outputs: { "agent-service.artifact": resolve(context.repositoryRoot, agentLocalArtifact), "agent-service.count": String(agents.length), "agent-service.digest": digestAgents(agents) } };
}

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
    await writeFile(wrapper, `import { POST } from ${JSON.stringify(agent.path)};\nexport default { fetch: POST };\n`);
    await build(bundleOptions(context.repositoryRoot, wrapper, functionDirectory, "index.mjs", true));
    await writeJson(resolve(functionDirectory, ".vc-config.json"), { runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration: 300 });
    await writeFile(resolve(functionDirectory, ".openbot-digest"), digest);
  });
  const healthSource = resolve(generated, "health.ts");
  const healthDirectory = resolve(output, "functions/healthz.func");
  await mkdir(healthDirectory, { recursive: true });
  await writeFile(healthSource, "export default { fetch() { return Response.json({ ok: true, service: 'openbot-agents' }); } };\n");
  builds.push((async () => { if (await readOptional(resolve(healthDirectory, "index.mjs"))) return; await build(bundleOptions(context.repositoryRoot, healthSource, healthDirectory, "index.mjs", true)); await writeJson(resolve(healthDirectory, ".vc-config.json"), { runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs" }); })());
  await Promise.all(builds);
  await writeJson(resolve(output, "config.json"), { version: 3 });
  return { outputs: { "agent-service.artifact": root, "agent-service.count": String(agents.length), "agent-service.changed-count": String(changed), "agent-service.digest": digestValues(digests) } };
}

function bundleOptions(cwd: string, entry: string, outDir: string, filename: string, minify: boolean) {
  return { cwd, entry: [entry], format: "esm" as const, platform: "node" as const, target: "node24", outDir, clean: false, minify, sourcemap: false, outputOptions: { entryFileNames: filename } };
}
function localServerSource(agents: readonly AgentSource[]): string {
  const imports = agents.map((agent, index) => `import { POST as agent${index} } from ${JSON.stringify(agent.path)};`).join("\n");
  const routes = agents.map((agent, index) => `app.post(${JSON.stringify(`/api/agents/${agent.slug}`)}, (context) => agent${index}(context.req.raw));`).join("\n");
  const nodeServer = fileURLToPath(import.meta.resolve("@hono/node-server"));
  const hono = fileURLToPath(import.meta.resolve("hono"));
  return `import { serve } from ${JSON.stringify(nodeServer)};\nimport { Hono } from ${JSON.stringify(hono)};\n${imports}\nconst app = new Hono();\napp.get("/healthz", (context) => context.json({ ok: true, service: "openbot-agents" }));\n${routes}\nconst port = Number.parseInt(process.env.OPENBOT_AGENT_PORT ?? "4101", 10);\nserve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => console.log(\`OpenBot agent service listening at http://127.0.0.1:\${port}\`));\n`;
}
function digestAgents(agents: readonly AgentSource[]): string { return createHash("sha256").update(agents.map((agent) => `${agent.slug}:${agent.path}`).join("\n")).digest("hex"); }
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
async function writeJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
