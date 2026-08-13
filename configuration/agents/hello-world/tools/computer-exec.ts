import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

interface ComputerExecInput {
  command: string;
  arguments?: string[];
  cwd?: string;
  timeout_ms?: number;
}

export default tool({
  description: "Run a command as this agent inside its private computer workspace.",
  inputSchema: jsonSchema<ComputerExecInput>({
    type: "object",
    properties: {
      command: { type: "string" },
      arguments: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      timeout_ms: { type: "integer", minimum: 1, maximum: 1_200_000 },
    },
    required: ["command"],
    additionalProperties: false,
  }),
  execute: async (input, options) => computerService().exec({
    agentId,
    command: input.command,
    arguments: input.arguments ?? [],
    cwd: input.cwd ?? "",
    timeoutMilliseconds: input.timeout_ms ?? 0,
  }, computerCallOptions(options.abortSignal)),
});
