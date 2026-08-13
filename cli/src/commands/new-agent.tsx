import arg from "arg";
import { scaffoldAgent, type ScaffoldedAgent } from "../agent-scaffold.js";
import { repositoryRoot } from "../paths.js";
import { inkPrompts } from "./init.js";

export interface NewAgentRunResult {
  agent: ScaffoldedAgent;
  json: boolean;
}

export async function runNewAgent(args: readonly string[] = []): Promise<NewAgentRunResult> {
  const parsed = arg({ "--json": Boolean }, { argv: [...args] });
  const suppliedName = parsed._.join(" ").trim();
  if (!suppliedName && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error(
      'openbot new-agent requires a name in non-interactive use, for example: openbot new-agent "Research Agent"',
    );
  }
  const name = suppliedName || (await inkPrompts.input("Agent name", { required: true }));
  return { agent: await scaffoldAgent(repositoryRoot, name), json: parsed["--json"] ?? false };
}
