import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, vi } from "vite-plus/test";

import * as ServerSecretStore from "../../auth/ServerSecretStore.ts";
import * as ElevenLabsTts from "./ElevenLabsTts.ts";

const memorySecretStore = () => {
  const secrets = new Map<string, Uint8Array>();
  return {
    secrets,
    layer: Layer.mock(ServerSecretStore.ServerSecretStore)({
      get: (name) => Effect.sync(() => Option.fromNullishOr(secrets.get(name))),
      set: (name, value) => Effect.sync(() => void secrets.set(name, value)),
      remove: (name) => Effect.sync(() => void secrets.delete(name)),
    }),
  };
};

const makeService = (store: ReturnType<typeof memorySecretStore>) =>
  ElevenLabsTts.ElevenLabsTts.pipe(
    Effect.provide(
      ElevenLabsTts.layer.pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(store.layer)),
    ),
  );

it.effect("sends text to the chosen voice with the stored key and returns the audio", () =>
  Effect.gen(function* () {
    const store = memorySecretStore();
    const service = yield* makeService(store);
    const upstream = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1, 2, 3])));
    const speak = (text: string) =>
      service.speech(text).pipe(Effect.provideService(FetchHttpClient.Fetch, upstream));

    expect(yield* Effect.flip(speak("hello"))).toMatchObject({
      _tag: "ForkTtsError",
      reason: "missing-key",
    });
    expect(upstream).not.toHaveBeenCalled();

    yield* service.setConfig({
      apiKey: Redacted.make("xi-key"),
      voiceId: "voice_1",
      modelId: "eleven_v3",
    });
    expect(yield* service.config).toEqual({
      configured: true,
      voiceId: "voice_1",
      modelId: "eleven_v3",
    });
    expect([...(yield* speak("hello"))]).toEqual([1, 2, 3]);

    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice_1?output_format=mp3_44100_128",
    );
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("xi-api-key")).toBe("xi-key");
    expect(JSON.parse(new TextDecoder().decode(init?.body as Uint8Array))).toEqual({
      text: "hello",
      model_id: "eleven_v3",
    });

    yield* service.setConfig({ apiKey: null });
    expect((yield* service.config).configured).toBe(false);
  }),
);

it.effect("uses the account's first voice when none is picked, and remembers it", () =>
  Effect.gen(function* () {
    const store = memorySecretStore();
    const service = yield* makeService(store);
    const upstream = vi.fn<typeof fetch>(async (input) =>
      String(input).includes("/v2/voices")
        ? Response.json({ voices: [{ voice_id: "first", name: "First", category: "premade" }] })
        : new Response(new Uint8Array([9])),
    );
    yield* service.setConfig({ apiKey: Redacted.make("xi-key") });
    yield* service.speech("hi").pipe(Effect.provideService(FetchHttpClient.Fetch, upstream));

    expect(String(upstream.mock.calls[0]![0])).toBe(
      "https://api.elevenlabs.io/v2/voices?page_size=1",
    );
    expect(String(upstream.mock.calls[1]![0])).toContain("/v1/text-to-speech/first?");
    expect((yield* service.config).voiceId).toBe("first");
  }),
);

it.each([
  [401, '{"detail":{"status":"invalid_api_key"}}', "rejected-key"],
  [401, '{"detail":{"status":"quota_exceeded"}}', "quota-exceeded"],
  [400, '{"detail":{"status":"voice_not_found"}}', "voice-unavailable"],
  [404, "", "voice-unavailable"],
  [429, "", "rate-limit"],
  [500, "not json", "unavailable"],
] as const)("maps ElevenLabs %i %s to %s", (status, body, reason) => {
  expect(ElevenLabsTts.elevenLabsErrorReason(status, body)).toBe(reason);
});
