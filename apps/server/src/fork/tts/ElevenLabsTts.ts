/**
 * FORK(tts): ElevenLabs text-to-speech for assistant messages. Fork-only; see FORK.md.
 *
 * The API key lives in the server secret store, the same 0700 directory T3 Code
 * keeps its own tokens in, so it never reaches the browser or settings.json.
 */
import {
  FORK_TTS_DEFAULT_MODEL,
  ForkTtsError,
  type ForkTtsConfig,
  type ForkTtsErrorReason,
  type ForkTtsVoice,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import * as ServerSecretStore from "../../auth/ServerSecretStore.ts";

const API_BASE = "https://api.elevenlabs.io";
const OUTPUT_FORMAT = "mp3_44100_128";
const KEY_SECRET = "fork-tts-elevenlabs-api-key";
const CONFIG_SECRET = "fork-tts-elevenlabs-config";

export class ForkTtsStorageError extends Schema.TaggedError<ForkTtsStorageError>()(
  "ForkTtsStorageError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Couldn't read or save the ElevenLabs settings.";
  }
}

const StoredConfig = Schema.Struct({
  voiceId: Schema.NullOr(Schema.String),
  modelId: Schema.String,
});
type StoredConfig = typeof StoredConfig.Type;
const decodeStoredConfig = Schema.decodeUnknownOption(Schema.fromJsonString(StoredConfig));
const encodeStoredConfig = Schema.encodeSync(Schema.fromJsonString(StoredConfig));

const VoicesResponse = Schema.Struct({
  voices: Schema.Array(
    Schema.Struct({
      voice_id: Schema.String,
      name: Schema.optionalKey(Schema.NullOr(Schema.String)),
      category: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  ),
});

const ErrorBody = Schema.Struct({
  detail: Schema.optionalKey(
    Schema.Union([
      Schema.String,
      Schema.Struct({
        status: Schema.optionalKey(Schema.String),
        code: Schema.optionalKey(Schema.String),
      }),
    ]),
  ),
});
const decodeErrorBody = Schema.decodeUnknownOption(Schema.fromJsonString(ErrorBody));

/**
 * Maps an ElevenLabs error response to a reason the UI can explain. ElevenLabs
 * sends quota and bad-voice failures with generic status codes, so the body's
 * `detail.status` (or `detail.code`) is checked first.
 */
export function elevenLabsErrorReason(status: number, body: string): ForkTtsErrorReason {
  const detail = Option.getOrUndefined(decodeErrorBody(body))?.detail;
  const code = typeof detail === "object" ? `${detail.status ?? ""} ${detail.code ?? ""}` : "";
  if (/quota/i.test(code)) return "quota-exceeded";
  if (/voice/i.test(code)) return "voice-unavailable";
  if (status === 401 || status === 403) return "rejected-key";
  if (status === 402) return "quota-exceeded";
  if (status === 429) return "rate-limit";
  if (status === 404) return "voice-unavailable";
  return "unavailable";
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

export class ElevenLabsTts extends Context.Service<
  ElevenLabsTts,
  {
    readonly config: Effect.Effect<ForkTtsConfig, ForkTtsStorageError>;
    readonly setConfig: (update: {
      readonly apiKey?: Redacted.Redacted<string> | null;
      readonly voiceId?: string | null;
      readonly modelId?: string;
    }) => Effect.Effect<void, ForkTtsStorageError>;
    readonly voices: Effect.Effect<ReadonlyArray<ForkTtsVoice>, ForkTtsError | ForkTtsStorageError>;
    /** MP3 audio for one chunk of text. */
    readonly speech: (
      text: string,
    ) => Effect.Effect<Uint8Array, ForkTtsError | ForkTtsStorageError>;
  }
>()("t3/fork/tts/ElevenLabsTts") {}

export const layer = Layer.effect(
  ElevenLabsTts,
  Effect.gen(function* () {
    const store = yield* ServerSecretStore.ServerSecretStore;
    const http = yield* HttpClient.HttpClient;
    const storage = (cause: unknown) => new ForkTtsStorageError({ cause });

    const readKey = store
      .get(KEY_SECRET)
      .pipe(Effect.map(Option.map((bytes) => fromUtf8.decode(bytes))), Effect.mapError(storage));
    const readConfig: Effect.Effect<StoredConfig, ForkTtsStorageError> = store
      .get(CONFIG_SECRET)
      .pipe(
        Effect.map((bytes) =>
          Option.getOrElse(
            Option.flatMap(bytes, (value) => decodeStoredConfig(fromUtf8.decode(value))),
            () => ({ voiceId: null, modelId: FORK_TTS_DEFAULT_MODEL }),
          ),
        ),
        Effect.mapError(storage),
      );
    const writeConfig = (next: StoredConfig) =>
      store
        .set(CONFIG_SECRET, utf8.encode(encodeStoredConfig(next)))
        .pipe(Effect.mapError(storage));

    // Audio and the key never follow a redirect, and trace headers never go to a third party.
    const execute = (request: HttpClientRequest.HttpClientRequest, key: string) =>
      http.execute(request.pipe(HttpClientRequest.setHeader("xi-api-key", key))).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
        Effect.provideService(HttpClient.TracerPropagationEnabled, false),
        Effect.mapError(() => new ForkTtsError({ reason: "unavailable" })),
      );
    const failFrom = (response: HttpClientResponse.HttpClientResponse) =>
      response.text.pipe(
        Effect.orElseSucceed(() => ""),
        Effect.flatMap((body) =>
          Effect.fail(new ForkTtsError({ reason: elevenLabsErrorReason(response.status, body) })),
        ),
      );
    const requireKey = readKey.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new ForkTtsError({ reason: "missing-key" })),
          onSome: Effect.succeed,
        }),
      ),
    );

    const listVoices = Effect.fn("ForkTts.voices")(function* (key: string, pageSize: number) {
      const response = yield* execute(
        HttpClientRequest.get(`${API_BASE}/v2/voices`).pipe(
          HttpClientRequest.setUrlParam("page_size", String(pageSize)),
          HttpClientRequest.acceptJson,
        ),
        key,
      );
      if (response.status < 200 || response.status >= 300) return yield* failFrom(response);
      const { voices } = yield* HttpClientResponse.schemaBodyJson(VoicesResponse)(response).pipe(
        Effect.mapError(() => new ForkTtsError({ reason: "unavailable" })),
      );
      return voices.map((voice): ForkTtsVoice => ({
        id: voice.voice_id,
        name: voice.name?.trim() || voice.voice_id,
        category: voice.category ?? null,
      }));
    });

    const config = Effect.gen(function* () {
      const [key, stored] = yield* Effect.all([readKey, readConfig]);
      return { configured: Option.isSome(key), ...stored };
    });

    const setConfig = Effect.fn("ForkTts.setConfig")(function* (update: {
      readonly apiKey?: Redacted.Redacted<string> | null;
      readonly voiceId?: string | null;
      readonly modelId?: string;
    }) {
      if (update.apiKey === null) {
        yield* store.remove(KEY_SECRET).pipe(Effect.mapError(storage));
      } else if (update.apiKey !== undefined) {
        yield* store
          .set(KEY_SECRET, utf8.encode(Redacted.value(update.apiKey)))
          .pipe(Effect.mapError(storage));
      }
      if (update.voiceId !== undefined || update.modelId !== undefined) {
        const current = yield* readConfig;
        yield* writeConfig({
          voiceId: update.voiceId === undefined ? current.voiceId : update.voiceId,
          modelId: update.modelId ?? current.modelId,
        });
      }
    });

    const voices = Effect.gen(function* () {
      return yield* listVoices(yield* requireKey, 100);
    });

    const speech = Effect.fn("ForkTts.speech")(
      function* (text: string) {
        const key = yield* requireKey;
        const stored = yield* readConfig;
        let voiceId = stored.voiceId;
        if (voiceId === null) {
          // No voice picked yet: use the account's first voice and remember it.
          const [first] = yield* listVoices(key, 1);
          if (!first) return yield* new ForkTtsError({ reason: "voice-unavailable" });
          voiceId = first.id;
          yield* writeConfig({ ...stored, voiceId });
        }
        const response = yield* execute(
          HttpClientRequest.post(
            `${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
          ).pipe(
            HttpClientRequest.setUrlParam("output_format", OUTPUT_FORMAT),
            HttpClientRequest.accept("audio/mpeg"),
            HttpClientRequest.bodyJsonUnsafe({ text, model_id: stored.modelId }),
          ),
          key,
        );
        if (response.status < 200 || response.status >= 300) return yield* failFrom(response);
        const audio = yield* response.arrayBuffer.pipe(
          Effect.mapError(() => new ForkTtsError({ reason: "unavailable" })),
        );
        return new Uint8Array(audio);
      },
      (effect) =>
        effect.pipe(
          Effect.timeoutOrElse({
            duration: "90 seconds",
            orElse: () => Effect.fail(new ForkTtsError({ reason: "unavailable" })),
          }),
        ),
    );

    return ElevenLabsTts.of({ config, setConfig, voices, speech });
  }),
);
