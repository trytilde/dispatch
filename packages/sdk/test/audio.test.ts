import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { type AgentAudioConfiguration, createClient } from "../src";

afterEach(() => vi.unstubAllGlobals());
const audio: AgentAudioConfiguration = {
  mode: "pipeline",
  sttModel: "gpt-4o-mini-transcribe",
  ttsModel: "gpt-4o-mini-tts",
  realtimeModel: "gpt-realtime",
  voice: "alloy",
  instructions: "Brief replies",
  maxDurationSeconds: 180,
};

describe("ChatKit audio", () => {
  it("configures agent-owned speech with scoped authentication", async () => {
    const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) =>
      Response.json({ audio: null }),
    );
    vi.stubGlobal("fetch", fetch);
    const client = createClient({
      baseUrl: "https://example.test",
      orgId: "org",
      teamId: "team",
      apiKey: "secret-test",
    });
    await client.chatkit.audio.configure({ agentId: "agent/one", audio });
    const call = fetch.mock.calls[0];
    if (!call) throw new Error("Expected an HTTP request");
    const [url, options] = call;
    expect(url instanceof Request ? url.url : url.toString()).toContain(
      "/api/v1/team/team/chatkit/agents/agent%2Fone/audio",
    );
    if (!options || typeof options.body !== "string") throw new Error("Expected JSON request body");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body).audio).toMatchObject({
      mode: "pipeline",
      stt_model: audio.sttModel,
      max_duration_seconds: 180,
      language: "en-US",
      interruptible: true,
    });
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer secret-test");
  });
  it("maps media bootstrap without exposing stored provider credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) =>
        Response.json({
          audio_session: { id: "live", session_id: "conversation" },
          token: "one-time",
          websocket_path: "/api/v1/chatkit/audio/live/media",
        }),
      ),
    );
    const client = createClient({
      baseUrl: "https://example.test",
      teamId: "team",
      apiKey: "secret-test",
    });
    expect(await client.chatkit.audio.start({ agentId: "agent" })).toEqual({
      id: "live",
      sessionId: "conversation",
      token: "one-time",
      websocketPath: "/api/v1/chatkit/audio/live/media",
    });
  });
  it("disables speech with an explicit null", async () => {
    const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) =>
      Response.json({ audio: null }),
    );
    vi.stubGlobal("fetch", fetch);
    const client = createClient({
      baseUrl: "https://example.test",
      teamId: "team",
      apiKey: "secret-test",
    });
    await client.chatkit.audio.configure({ agentId: "agent", audio: null });
    const call = fetch.mock.calls[0];
    if (!call) throw new Error("Expected an HTTP request");
    const [, options] = call;
    if (!options || typeof options.body !== "string") throw new Error("Expected JSON request body");
    expect(JSON.parse(options.body)).toEqual({ audio: null });
  });
});

it("round trips carrier relay settings without an OpenAI credential", async () => {
  const relay: AgentAudioConfiguration = {
    ...audio,
    mode: "telnyx_relay",
    sttModel: "deepgram/nova-3",
    voice: "Telnyx.Ultra.Callie",
    language: "en-US",
    interruptible: false,
  };
  const wire = {
    mode: "telnyx_relay",
    credential_id: null,
    stt_model: relay.sttModel,
    tts_model: relay.ttsModel,
    realtime_model: relay.realtimeModel,
    voice: relay.voice,
    instructions: relay.instructions,
    max_duration_seconds: relay.maxDurationSeconds,
    language: "en-US",
    interruptible: false,
  };
  const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) =>
    Response.json({ audio: wire }),
  );
  vi.stubGlobal("fetch", fetch);
  const client = createClient({
    baseUrl: "https://example.test",
    teamId: "team",
    apiKey: "secret-test",
  });
  await client.chatkit.audio.configure({ agentId: "relay", audio: relay });
  const options = fetch.mock.calls[0]?.[1];
  if (typeof options?.body !== "string") throw new Error("Expected configuration body");
  expect(JSON.parse(options.body)).toEqual({ audio: wire });
  expect(await client.chatkit.audio.get({ agentId: "relay" })).toEqual(relay);
});

it.each(["channel-voice", undefined])(
  "maps the optional Telnyx channel assignment %s",
  async (channelInboxId) => {
    const fetch = vi.fn(async (..._args: Parameters<typeof globalThis.fetch>) =>
      Response.json({
        webhook_url: "https://api.example.test/carrier/webhook",
        ...(channelInboxId ? { route: { channel_inbox_id: channelInboxId } } : {}),
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const client = createClient({
      baseUrl: "https://example.test",
      orgId: "org",
      teamId: "team",
      apiKey: "secret-test",
    });
    const result = await client.chatkit.audio.configureTelnyx({
      agentId: "relay",
      credentialId: "credential-voice",
      publicKey: "test-public-key",
      phoneNumber: "+12025550100",
      connectionId: "application-voice",
      mediaBaseUrl: "https://media.example.test",
    });
    expect(result).toEqual({
      webhookUrl: "https://api.example.test/carrier/webhook",
      ...(channelInboxId ? { channelInboxId } : {}),
    });
    const options = fetch.mock.calls[0]?.[1];
    if (typeof options?.body !== "string") throw new Error("Expected Telnyx configuration body");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({
      credential_id: "credential-voice",
      public_key: "test-public-key",
      phone_number: "+12025550100",
      connection_id: "application-voice",
      media_base_url: "https://media.example.test",
    });
  },
);
