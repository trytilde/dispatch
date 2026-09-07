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
