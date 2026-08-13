import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

interface GrepInput { pattern: string; path?: string; glob?: string }

export default tool({
  description: "Search file contents inside this agent's private /workspace.",
  inputSchema: jsonSchema<GrepInput>({
    type: "object",
    properties: { pattern: { type: "string" }, path: { type: "string" }, glob: { type: "string" } },
    required: ["pattern"],
    additionalProperties: false,
  }),
  execute: async ({ pattern, path, glob }, options) => computerService().exec({
    agentId,
    command: "rg",
    arguments: ["--line-number", "--no-heading", "--color", "never", "--hidden", "--glob", "!.git", ...(glob ? ["--glob", glob] : []), pattern, path ?? "/workspace"],
    cwd: "/workspace",
    timeoutMilliseconds: 120_000,
  }, computerCallOptions(options.abortSignal)),
});
