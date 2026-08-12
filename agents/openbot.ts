import { defineAgent } from "@openbot/agent-sdk";
import { consumeStream, stepCountIs, streamText } from "ai";

export default defineAgent({
  id: "openbot",
  displayName: "OpenBot",
  description: "The default general-purpose OpenBot agent.",
  registration: { provider: "tilde-agents", streaming: true, timeoutMs: 300_000, skills: ["*"] },
  async run(context) {
    const result = streamText({
      model: context.model,
      system: [context.baseSystemPrompt, "You are OpenBot, a concise and capable assistant.", "Explain actions before using the computer or an external tool."].filter(Boolean).join("\n\n"),
      messages: [...context.messages],
      tools: context.tools,
      stopWhen: stepCountIs(12),
      abortSignal: context.signal,
      onFinish: context.close,
      onAbort: context.close,
      onError: context.close,
    });
    return result.toUIMessageStreamResponse({ consumeSseStream: consumeStream });
  },
});
