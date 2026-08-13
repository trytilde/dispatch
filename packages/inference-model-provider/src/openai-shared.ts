export const OPENAI_PROMPT_PART = [
  "OpenAI model runtime:",
  "- Use native tool calls when a provided tool can materially advance the task; never describe a tool call as if it already happened.",
  "- Keep tool arguments minimal and schema-valid. Use tool results as evidence, and do not expose hidden reasoning or provider credentials.",
].join("\n");

export function requireModelName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("Inference model name is required");
  return normalized;
}

export function requireCredentialValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
