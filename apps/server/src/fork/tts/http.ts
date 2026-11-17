/** FORK(tts): HTTP handlers for the fork-only `forkTts` API group. See FORK.md. */
import {
  AuthOrchestrationOperateScope,
  AuthSettingsWriteScope,
  type AuthEnvironmentScope,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  requireEnvironmentScope,
} from "../../auth/http.ts";
import * as ServerSecretStore from "../../auth/ServerSecretStore.ts";
import * as ElevenLabsTts from "./ElevenLabsTts.ts";

export const forkTtsHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "forkTts",
  Effect.fnUntraced(function* (handlers) {
    const tts = yield* ElevenLabsTts.ElevenLabsTts;
    const guard = Effect.fnUntraced(function* (
      endpoint: string,
      scope: AuthEnvironmentScope = AuthOrchestrationOperateScope,
    ) {
      yield* annotateEnvironmentRequest(endpoint);
      yield* requireEnvironmentScope(scope);
    });
    const storageFailure = {
      ForkTtsStorageError: (error: ElevenLabsTts.ForkTtsStorageError) =>
        failEnvironmentInternal("internal_error", error),
    };

    return handlers
      .handle(
        "config",
        Effect.fn("environment.forkTts.config")(function* (args) {
          yield* guard(args.endpoint.name);
          return yield* tts.config.pipe(Effect.catchTags(storageFailure));
        }),
      )
      .handle(
        "setConfig",
        Effect.fn("environment.forkTts.setConfig")(function* (args) {
          // Changing the key or voice is a settings change, like the cloud voice keys.
          yield* guard(args.endpoint.name, AuthSettingsWriteScope);
          yield* tts.setConfig(args.payload).pipe(Effect.catchTags(storageFailure));
        }),
      )
      .handle(
        "voices",
        Effect.fn("environment.forkTts.voices")(function* (args) {
          yield* guard(args.endpoint.name);
          return { voices: yield* tts.voices.pipe(Effect.catchTags(storageFailure)) };
        }),
      )
      .handle(
        "speech",
        Effect.fn("environment.forkTts.speech")(function* (args) {
          yield* guard(args.endpoint.name);
          return yield* tts.speech(args.payload.text).pipe(Effect.catchTags(storageFailure));
        }),
      );
  }),
).pipe(Layer.provide(ElevenLabsTts.layer), Layer.provide(ServerSecretStore.layer));
