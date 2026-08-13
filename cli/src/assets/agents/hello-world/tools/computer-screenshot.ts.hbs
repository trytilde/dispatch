import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

export default tool({
  description: "Capture the shared computer desktop as a PNG encoded in base64.",
  inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {}, additionalProperties: false }),
  execute: async (_input, options) => {
    const response = await computerService().screenshot({ agentId }, computerCallOptions(options.abortSignal));
    return { media_type: "image/png", content_base64: Buffer.from(response.png).toString("base64") };
  },
});
