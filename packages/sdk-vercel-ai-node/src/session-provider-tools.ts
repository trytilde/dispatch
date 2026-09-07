import type { Client } from "@trytilde/sdk";
import type { ToolSet } from "ai";

/** Adapt the current turn's canonical provider tools to the Vercel AI tool interface. */
export async function sessionProviderTools(
  client: Client,
  input: { sessionId: string },
): Promise<ToolSet> {
  const { jsonSchema, tool } = await import("ai");
  const bound = await client.chatkit.sessionTools(input);
  return Object.fromEntries(
    bound.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: jsonSchema<Record<string, unknown>>(definition.inputSchema),
        execute: async (arguments_, options) =>
          definition.execute(arguments_ as Parameters<typeof definition.execute>[0], {
            toolCallId: options.toolCallId,
          }),
      }),
    ]),
  );
}
