import { createHash } from "node:crypto";
import { posix } from "node:path";
import { Code, ConnectError } from "@connectrpc/connect";

export interface AgentCommand {
  command: string;
  arguments: string[];
}

export function agentLinuxUsername(agentId: string): string {
  validateAgentId(agentId);
  return `ob_${createHash("sha256").update(agentId).digest("hex").slice(0, 16)}`;
}

export function agentWorkspaceRoot(agentId: string): string {
  validateAgentId(agentId);
  return `/workspace/.openbot/agents/${agentId}/workspace`;
}

export function logicalWorkspacePath(path: string): string {
  const relative = path.startsWith("/workspace/") ? path.slice("/workspace/".length) : path === "/workspace" ? "." : path;
  if (!relative || relative.startsWith("/") || relative.includes("\0")) throw new ConnectError("Computer path must be inside /workspace", Code.PermissionDenied);
  const normalized = posix.normalize(relative);
  if (normalized === ".." || normalized.startsWith("../")) throw new ConnectError("Computer path escapes /workspace", Code.PermissionDenied);
  return normalized === "." ? "/workspace" : `/workspace/${normalized}`;
}

export function agentCommand(
  agentId: string,
  command: string,
  args: readonly string[] = [],
  options: { cwd?: string; environment?: Readonly<Record<string, string>> } = {},
): AgentCommand {
  if (!command) throw new ConnectError("Command is required", Code.InvalidArgument);
  return {
    command: "/usr/local/bin/openbot-agent-exec",
    arguments: [
      agentWorkspaceRoot(agentId),
      agentLinuxUsername(agentId),
      logicalWorkspacePath(options.cwd ?? "/workspace"),
      ...Object.entries(options.environment ?? {}).map(([name, value]) => `${name}=${value}`),
      command,
      ...args,
    ],
  };
}

function validateAgentId(agentId: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId)) throw new ConnectError("A valid agent_id is required", Code.InvalidArgument);
}
