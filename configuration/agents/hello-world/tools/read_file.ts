import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

export default tool({
  description: "Read a UTF-8 file from this agent's private /workspace.",
  inputSchema: jsonSchema<{ path: string }>({
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  }),
  execute: async ({ path }, options) => {
    const response = await computerService().readFile({ agentId, path }, computerCallOptions(options.abortSignal));
    return { content: new TextDecoder().decode(response.content) };
  },
});
