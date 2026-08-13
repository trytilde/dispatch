import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

interface GlobInput { pattern: string; path?: string }

export default tool({
  description: "List files matching a glob inside this agent's private /workspace.",
  inputSchema: jsonSchema<GlobInput>({
    type: "object",
    properties: { pattern: { type: "string" }, path: { type: "string" } },
    required: ["pattern"],
    additionalProperties: false,
  }),
  execute: async ({ pattern, path }, options) => computerService().exec({
    agentId,
    command: "rg",
    arguments: ["--files", "--hidden", "--glob", "!.git", "--glob", pattern, path ?? "/workspace"],
    cwd: "/workspace",
    timeoutMilliseconds: 120_000,
  }, computerCallOptions(options.abortSignal)),
});
