import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

interface BashInput { command: string; cwd?: string; timeout_ms?: number }

export default tool({
  description: "Run a Bash command as this agent inside its private /workspace.",
  inputSchema: jsonSchema<BashInput>({
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
      timeout_ms: { type: "integer", minimum: 1, maximum: 1_200_000 },
    },
    required: ["command"],
    additionalProperties: false,
  }),
  execute: async (input, options) => computerService().exec({
    agentId,
    command: "bash",
    arguments: ["-lc", input.command],
    cwd: input.cwd ?? "/workspace",
    timeoutMilliseconds: input.timeout_ms ?? 0,
  }, computerCallOptions(options.abortSignal)),
});
