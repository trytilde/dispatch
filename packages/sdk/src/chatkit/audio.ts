import type { NormalizedConfig } from "../config";
import { requestJson } from "../internal/fetch-client";
import { pathWithParams, teamPath } from "../internal/paths";

/** Agent-owned voice settings; relay delegates recognition and synthesis to Telnyx. */
export interface AgentAudioConfiguration {
  mode: "pipeline" | "realtime" | "telnyx_relay";
  credentialId?: string;
  sttModel: string;
  ttsModel: string;
  realtimeModel: string;
  voice: string;
  instructions: string;
  maxDurationSeconds: number;
  /** Defaults to en-US when omitted. */
  language?: string;
  /** Whether caller speech may interrupt playback; defaults to true. */
  interruptible?: boolean;
}

type AudioWire = {
  mode: "pipeline" | "realtime" | "telnyx_relay";
  credential_id?: string | null;
  stt_model: string;
  tts_model: string;
  realtime_model: string;
  voice: string;
  instructions: string;
  max_duration_seconds: number;
  language?: string;
  interruptible?: boolean;
};

/** Serialize the stable SDK configuration into its API representation. */
export function audioToWire(value: AgentAudioConfiguration): AudioWire {
  return {
    mode: value.mode,
    credential_id: value.credentialId ?? null,
    stt_model: value.sttModel,
    tts_model: value.ttsModel,
    realtime_model: value.realtimeModel,
    voice: value.voice,
    instructions: value.instructions,
    max_duration_seconds: value.maxDurationSeconds,
    language: value.language ?? "en-US",
    interruptible: value.interruptible ?? true,
  };
}

/** Manage agent-owned speech settings and create normal ChatKit voice sessions. */
export class AudioClient {
  constructor(private readonly config: NormalizedConfig) {}

  private path(agentId: string): string {
    return teamPath(
      this.config,
      pathWithParams("/api/v1/team/{team_id}/chatkit/agents/{agent_id}/audio", {
        agent_id: agentId,
      }),
    );
  }

  async configure(input: {
    agentId: string;
    audio: AgentAudioConfiguration | null;
  }): Promise<void> {
    await requestJson(this.config, {
      method: "PUT",
      path: this.path(input.agentId),
      body: { audio: input.audio ? audioToWire(input.audio) : null },
    });
  }

  async get(input: { agentId: string }): Promise<AgentAudioConfiguration | null> {
    const { audio: a } = await requestJson<{ audio: AudioWire | null }>(this.config, {
      method: "GET",
      path: this.path(input.agentId),
    });
    return a
      ? {
          mode: a.mode,
          ...(a.credential_id ? { credentialId: a.credential_id } : {}),
          sttModel: a.stt_model,
          ttsModel: a.tts_model,
          realtimeModel: a.realtime_model,
          voice: a.voice,
          instructions: a.instructions,
          maxDurationSeconds: a.max_duration_seconds,
          language: a.language ?? "en-US",
          interruptible: a.interruptible ?? true,
        }
      : null;
  }

  async start(input: { agentId: string }): Promise<{
    id: string;
    sessionId: string;
    token: string;
    websocketPath: string;
  }> {
    const result = await requestJson<{
      audio_session: { id: string; session_id: string };
      token: string;
      websocket_path: string;
    }>(this.config, {
      method: "POST",
      path: `${this.path(input.agentId)}/sessions`,
    });
    return {
      id: result.audio_session.id,
      sessionId: result.audio_session.session_id,
      token: result.token,
      websocketPath: result.websocket_path,
    };
  }
  /** Bind a Telnyx application and number; returns its verified webhook route. */
  async configureTelnyx(input: {
    agentId: string;
    credentialId: string;
    publicKey: string;
    phoneNumber: string;
    connectionId: string;
    mediaBaseUrl: string;
  }): Promise<{ webhookUrl: string; channelInboxId?: string }> {
    const result = await requestJson<{
      webhook_url: string;
      route?: { channel_inbox_id?: string | null };
    }>(this.config, {
      method: "PUT",
      path: `${this.path(input.agentId)}/telnyx`,
      body: {
        credential_id: input.credentialId,
        public_key: input.publicKey,
        phone_number: input.phoneNumber,
        connection_id: input.connectionId,
        media_base_url: input.mediaBaseUrl,
      },
    });
    return {
      webhookUrl: result.webhook_url,
      ...(result.route?.channel_inbox_id ? { channelInboxId: result.route.channel_inbox_id } : {}),
    };
  }
}
