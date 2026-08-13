import { jsonSchema, tool } from "ai";
import { agentId, computerCallOptions, computerService } from "../lib/computer-service.js";

type ComputerInput =
  | { action: "mouse_move"; x: number; y: number }
  | { action: "click"; button?: 1 | 2 | 3 }
  | { action: "type"; text: string; delay_ms?: number }
  | { action: "key"; key: string };

export default tool({
  description: "Send a bounded mouse or keyboard action to the shared computer desktop as this agent.",
  inputSchema: jsonSchema<ComputerInput>({
    oneOf: [
      { type: "object", properties: { action: { const: "mouse_move" }, x: { type: "integer" }, y: { type: "integer" } }, required: ["action", "x", "y"], additionalProperties: false },
      { type: "object", properties: { action: { const: "click" }, button: { type: "integer", enum: [1, 2, 3] } }, required: ["action"], additionalProperties: false },
      { type: "object", properties: { action: { const: "type" }, text: { type: "string" }, delay_ms: { type: "integer", minimum: 0 } }, required: ["action", "text"], additionalProperties: false },
      { type: "object", properties: { action: { const: "key" }, key: { type: "string" } }, required: ["action", "key"], additionalProperties: false },
    ],
  }),
  execute: async (input, options) => {
    const { action, ...payload } = input;
    return computerService().input({ agentId, action, payloadJson: JSON.stringify(payload) }, computerCallOptions(options.abortSignal));
  },
});
