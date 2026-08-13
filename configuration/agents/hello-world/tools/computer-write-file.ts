import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

interface ComputerWriteFileInput { path: string; content_base64: string; mode?: number }

export default tool({
  description: "Write base64 content to a file in this agent's private computer workspace.",
  inputSchema: jsonSchema<ComputerWriteFileInput>({
    type: "object",
    properties: {
      path: { type: "string" },
      content_base64: { type: "string", contentEncoding: "base64" },
      mode: { type: "integer", minimum: 0, maximum: 4095 },
    },
    required: ["path", "content_base64"],
    additionalProperties: false,
  }),
  execute: async ({ path, content_base64, mode }, options) => {
    const response = await computerService().writeFile({
      agentId,
      path,
      content: Buffer.from(content_base64, "base64"),
      mode: mode ?? 0,
    }, computerCallOptions(options.abortSignal));
    return { bytes_written: Number(response.bytesWritten) };
  },
});
