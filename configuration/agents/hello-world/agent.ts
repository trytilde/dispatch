import { OpenAIApiKeyInferenceModelProvider } from "@openbot/inference-model-provider";
import { chatKitEndpoint, convertToAiSdkMessages, createClient, createMCPClient } from "@trytilde/harness-sdk-vercel-ai-node";
import { consumeStream, convertToModelMessages, stepCountIs, streamText } from "ai";
import instructions from "./instructions.js";
import computerExec from "./tools/computer-exec.js";
import computerInput from "./tools/computer-input.js";
import computerReadFile from "./tools/computer-read-file.js";
import computerScreenshot from "./tools/computer-screenshot.js";
import computerWriteFile from "./tools/computer-write-file.js";
import helloWorld from "./tools/hello-world.js";

function requiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`${names.join(" or ")} is required`);
}

const client = createClient({
  apiKey: requiredEnv("OPENBOT_AGENT_HELLO_WORLD_API_KEY", "OPENBOT_TILDE_API_KEY"),
  baseUrl: process.env.TILDE_BASE_URL ?? "https://api.trytilde.ai",
  orgId: requiredEnv("OPENBOT_TILDE_ORG_ID"),
  orgSubdomain: false,
  teamId: requiredEnv("OPENBOT_TILDE_TEAM_ID"),
});
const inferenceModelProvider = new OpenAIApiKeyInferenceModelProvider({ apiKey: requiredEnv("OPENBOT_OPENAI_API_KEY") });

export default chatKitEndpoint({
  client,
  webhookSigningKey: requiredEnv("OPENBOT_AGENT_HELLO_WORLD_WEBHOOK_SIGNING_KEY", "OPENBOT_TILDE_WEBHOOK_SIGNING_KEY"),
  requestTimeoutMs: 285_000,
  async handler(request, context) {
    const serverId = process.env.OPENBOT_TILDE_RUNTIME_MCP_SERVER_ID;
    const runtime = serverId ? await createMCPClient({ client, serverId }) : undefined;
    const close = async () => runtime?.closeMcp();
    try {
      const runtimeTools = runtime ? await runtime.mcp.tools() : {};
      const history = await context.session.history();
      const messages = await convertToAiSdkMessages({ messages: [...history.items, ...context.messages], chatkit: context.chatkit });
      const result = streamText({
        abortSignal: request.signal,
        messages: await convertToModelMessages(messages),
        model: inferenceModelProvider.model(process.env.OPENBOT_OPENAI_MODEL ?? "gpt-5.4"),
        stopWhen: stepCountIs(12),
        system: instructions,
        tools: {
          ...runtimeTools,
          computer_exec: computerExec,
          computer_input: computerInput,
          computer_read_file: computerReadFile,
          computer_screenshot: computerScreenshot,
          computer_write_file: computerWriteFile,
          hello_world: helloWorld,
        },
        onAbort: close,
        onError: close,
        onFinish: close,
      });
      return result.toUIMessageStreamResponse({ consumeSseStream: consumeStream, originalMessages: messages });
    } catch (error) {
      await close();
      throw error;
    }
  },
});
