import type { JsonValue } from "@trytilde/sdk";

/** Server-authored speech context from the signed ChatKit turn. */
export interface ChatKitAudioContext {
  liveSessionId: string;
  utteranceId: string;
  mode: "pipeline" | "realtime" | "telnyx_relay";
  live: boolean;
}

/** Carrier facts verified by Tilde before invoking the text agent. */
export interface ChatKitTelnyxContext {
  callControlId: string;
  callSessionId: string;
  from: string;
  to: string;
}

export interface ChatKitSpeechContext {
  type: "speech";
  audio: ChatKitAudioContext;
  telnyx?: ChatKitTelnyxContext;
}

/** Validate the speech projection before exposing it to an endpoint callback. */
export function parseSpeechContext(value: JsonValue | undefined): ChatKitSpeechContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.type !== "speech")
    return undefined;
  const audio = value.audio;
  if (
    !audio ||
    typeof audio !== "object" ||
    Array.isArray(audio) ||
    typeof audio.liveSessionId !== "string" ||
    typeof audio.utteranceId !== "string" ||
    (audio.mode !== "pipeline" && audio.mode !== "realtime" && audio.mode !== "telnyx_relay") ||
    typeof audio.live !== "boolean"
  ) {
    throw new Error("Invalid signed ChatKit audio context");
  }
  const result: ChatKitSpeechContext = {
    type: "speech",
    audio: {
      liveSessionId: audio.liveSessionId,
      utteranceId: audio.utteranceId,
      mode: audio.mode,
      live: audio.live,
    },
  };
  const telnyx = value.telnyx;
  if (telnyx !== undefined && telnyx !== null) {
    if (
      typeof telnyx !== "object" ||
      Array.isArray(telnyx) ||
      typeof telnyx.callControlId !== "string" ||
      typeof telnyx.callSessionId !== "string" ||
      typeof telnyx.from !== "string" ||
      typeof telnyx.to !== "string"
    ) {
      throw new Error("Invalid signed ChatKit Telnyx context");
    }
    result.telnyx = {
      callControlId: telnyx.callControlId,
      callSessionId: telnyx.callSessionId,
      from: telnyx.from,
      to: telnyx.to,
    };
  }
  return result;
}
