/**
 * FORK(tts): ElevenLabs read-aloud for assistant messages. Fork-only; see FORK.md.
 *
 * `environmentHttp.ts` builds this group with its own auth middleware and error
 * schemas, so this module imports nothing from it and adds no import cycle.
 */
import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";
// Type-only: erased at runtime, so `environmentHttp.ts` can import this module without a cycle.
import type {
  EnvironmentInternalError,
  EnvironmentScopeRequiredError,
} from "../environmentHttp.ts";

/** One synthesis request. The client splits longer messages; every model accepts this much. */
export const FORK_TTS_MAX_CHUNK_CHARS = 2_500;

export const FORK_TTS_DEFAULT_MODEL = "eleven_flash_v2_5";

/** Models offered in the picker. ElevenLabs lists more; these cover speed and quality. */
export const FORK_TTS_MODELS = [
  { id: "eleven_flash_v2_5", label: "Flash v2.5 (fast, lower cost)" },
  { id: "eleven_v4_turbo", label: "v4 Turbo (fast)" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (higher quality)" },
  { id: "eleven_v3", label: "v3 (most expressive)" },
] as const;

const ElevenLabsId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/),
);

export const ForkTtsApiKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512),
  Schema.isPattern(/^[!-~]+$/),
);

export const ForkTtsConfig = Schema.Struct({
  configured: Schema.Boolean,
  voiceId: Schema.NullOr(ElevenLabsId),
  modelId: ElevenLabsId,
});
export type ForkTtsConfig = typeof ForkTtsConfig.Type;

export const ForkTtsConfigUpdate = Schema.Struct({
  /** A new key, or `null` to remove the stored one. Omit to keep it. */
  apiKey: Schema.optionalKey(Schema.NullOr(Schema.RedactedFromValue(ForkTtsApiKey))),
  voiceId: Schema.optionalKey(Schema.NullOr(ElevenLabsId)),
  modelId: Schema.optionalKey(ElevenLabsId),
});

export const ForkTtsVoice = Schema.Struct({
  id: ElevenLabsId,
  name: Schema.String,
  category: Schema.NullOr(Schema.String),
});
export type ForkTtsVoice = typeof ForkTtsVoice.Type;

export const ForkTtsVoices = Schema.Struct({ voices: Schema.Array(ForkTtsVoice) });

export const ForkTtsSpeechRequest = Schema.Struct({
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(FORK_TTS_MAX_CHUNK_CHARS)),
});

export const ForkTtsErrorReason = Schema.Literals([
  "missing-key",
  "rejected-key",
  "quota-exceeded",
  "rate-limit",
  "voice-unavailable",
  "unavailable",
]);
export type ForkTtsErrorReason = typeof ForkTtsErrorReason.Type;

export class ForkTtsError extends Schema.TaggedError<ForkTtsError>()(
  "ForkTtsError",
  { reason: ForkTtsErrorReason },
  { httpApiStatus: 422 },
) {
  override get message() {
    switch (this.reason) {
      case "missing-key":
        return "Add an ElevenLabs API key to play messages aloud.";
      case "rejected-key":
        return "ElevenLabs rejected the API key.";
      case "quota-exceeded":
        return "The ElevenLabs account is out of character quota.";
      case "rate-limit":
        return "ElevenLabs is rate limiting requests. Try again shortly.";
      case "voice-unavailable":
        return "The selected ElevenLabs voice isn't available. Pick another voice.";
      case "unavailable":
        return "ElevenLabs couldn't generate audio.";
    }
  }
}

const OptionalBearerHeaders = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
  dpop: Schema.optionalKey(Schema.String),
});

/**
 * The group's endpoints. The caller adds its auth middleware and passes the
 * errors its scope guard can raise, so clients decode them like any other endpoint's.
 */
export const makeForkTtsHttpApi = (
  scopedErrors: readonly [typeof EnvironmentScopeRequiredError, typeof EnvironmentInternalError],
) =>
  HttpApiGroup.make("forkTts")
    .add(
      HttpApiEndpoint.get("config", "/api/fork/tts/config", {
        headers: OptionalBearerHeaders,
        success: ForkTtsConfig,
        error: [...scopedErrors, ForkTtsError],
      }),
    )
    .add(
      HttpApiEndpoint.post("setConfig", "/api/fork/tts/config", {
        headers: OptionalBearerHeaders,
        payload: ForkTtsConfigUpdate,
        success: HttpApiSchema.NoContent,
        error: [...scopedErrors, ForkTtsError],
      }),
    )
    .add(
      HttpApiEndpoint.get("voices", "/api/fork/tts/voices", {
        headers: OptionalBearerHeaders,
        success: ForkTtsVoices,
        error: [...scopedErrors, ForkTtsError],
      }),
    )
    .add(
      HttpApiEndpoint.post("speech", "/api/fork/tts/speech", {
        headers: OptionalBearerHeaders,
        payload: ForkTtsSpeechRequest,
        success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "audio/mpeg" })),
        error: [...scopedErrors, ForkTtsError],
      }),
    );
