import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

interface WriteFileInput { path: string; content: string }

export default tool({
  description: "Write UTF-8 text to a file in this agent's private /workspace.",
  inputSchema: jsonSchema<WriteFileInput>({
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
    additionalProperties: false,
  }),
  execute: async ({ path, content }, options) => {
    const response = await computerService().writeFile({
      agentId,
      path,
      content: new TextEncoder().encode(content),
      mode: 0,
    }, computerCallOptions(options.abortSignal));
    return { bytes_written: Number(response.bytesWritten) };
  },
});
