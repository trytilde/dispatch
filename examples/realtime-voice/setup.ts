import { writeFile } from "node:fs/promises";
import { type AgentAudioConfiguration, createClient } from "@trytilde/sdk";

/** Register isolated browser demos and a dedicated carrier relay demo; never reconfigure an existing phone number. */
async function setup() {
  const client = createClient({
    baseUrl: process.env.TILDE_BASE_URL,
    orgId: process.env.TILDE_ORG_ID,
    teamId: process.env.TILDE_TEAM_ID,
    apiKey: process.env.TILDE_API_KEY,
  });
  const origin = process.env.AGENT_ENDPOINT_ORIGIN;
  if (!origin || !process.env.TILDE_API_KEY)
    throw new Error("Set AGENT_ENDPOINT_ORIGIN and TILDE_API_KEY in .env.local");
  const agents: Record<string, unknown> = {};
  for (const mode of ["pipeline", "realtime", "telnyx_relay"] as const) {
    const audio: AgentAudioConfiguration = {
      mode,
      sttModel: mode === "telnyx_relay" ? "deepgram/nova-3" : "gpt-4o-mini-transcribe",
      ttsModel: "gpt-4o-mini-tts",
      realtimeModel: "gpt-realtime",
      voice: mode === "telnyx_relay" ? "Telnyx.Ultra.Callie" : "alloy",
      language: "en-US",
      interruptible: true,
      instructions:
        "You are a voice test assistant. Answer briefly. Explain that this is a test when asked.",
      maxDurationSeconds: 180,
    };
    const agent = await client.chatkit.registerHttpVercelAiSdkAgent({
      displayName: `Voice demo ${mode} ${Date.now()}`,
      endpointUrl: `${origin}/agent/${mode}`,
      streaming: true,
      timeoutMs: 60000,
      audio,
    });
    agents[mode] = agent;
    console.log(`${mode}: agent ${agent.agent.id}`);
    // Save after each registration so an interrupted setup preserves returned credentials.
    await writeFile(
      new URL(".agents.local.json", import.meta.url),
      JSON.stringify(agents, null, 2),
      { mode: 0o600 },
    );
  }
  console.log(
    "Saved .agents.local.json. Run pnpm dev; attach a Telnyx test number using the README.",
  );
  if (process.env.TELNYX_CREDENTIAL_ID) {
    const mode = process.env.TELNYX_AGENT_MODE ?? "telnyx_relay";
    const registration = agents[mode] as { agent: { id: string } } | undefined;
    if (
      !registration ||
      !process.env.TELNYX_PUBLIC_KEY ||
      !process.env.TELNYX_PHONE_NUMBER ||
      !process.env.TELNYX_CONNECTION_ID ||
      !process.env.VOICE_MEDIA_BASE_URL
    )
      throw new Error("Complete the Telnyx settings in .env.local");
    const result = await client.chatkit.audio.configureTelnyx({
      agentId: registration.agent.id,
      credentialId: process.env.TELNYX_CREDENTIAL_ID,
      publicKey: process.env.TELNYX_PUBLIC_KEY,
      phoneNumber: process.env.TELNYX_PHONE_NUMBER,
      connectionId: process.env.TELNYX_CONNECTION_ID,
      mediaBaseUrl: process.env.VOICE_MEDIA_BASE_URL,
    });
    console.log(`Set your Telnyx test application's webhook URL to ${result.webhookUrl}`);
  }
}
await setup();
