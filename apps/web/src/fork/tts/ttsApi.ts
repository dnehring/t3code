/**
 * FORK(tts): calls the fork-only `forkTts` endpoints on a thread's environment,
 * with this client's own credentials for it (bearer, cookie, or relay DPoP).
 */
import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { executeConnectedEnvironmentHttpRequest } from "@t3tools/client-runtime/state/environmentHttpAuth";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type * as Atom from "effect/reactivity/Atom";
import { AtomRegistry } from "effect/reactivity";

import { connectionAtomRuntime } from "../../connection/runtime";
import { appAtomRegistry } from "../../rpc/atomRegistry";

type ConnectedRequest<A, E, R> = Parameters<
  typeof executeConnectedEnvironmentHttpRequest<"forkTts", A, E, R>
>[0];

const request = <A, E, R>(
  environmentId: EnvironmentId,
  input: Omit<ConnectedRequest<A, E, R>, "group" | "timeoutMs" | "requestInit"> & {
    readonly timeoutMs?: number;
  },
) =>
  Effect.flatMap(EnvironmentRegistry.EnvironmentRegistry, (registry) =>
    registry.run(
      environmentId,
      executeConnectedEnvironmentHttpRequest({
        timeoutMs: 30_000,
        ...input,
        group: "forkTts",
        // The key and message text never follow a redirect to another host.
        requestInit: { redirect: "error" },
      }),
    ),
  );

export const getTtsConfig = (environmentId: EnvironmentId) =>
  request(environmentId, {
    method: "GET",
    url: (urls) => urls.config(),
    request: ({ client, headers }) => client.config({ headers }),
  });

export const setTtsConfig = (
  environmentId: EnvironmentId,
  update: {
    readonly apiKey?: string | null;
    readonly voiceId?: string | null;
    readonly modelId?: string;
  },
) =>
  request(environmentId, {
    method: "POST",
    url: (urls) => urls.setConfig(),
    request: ({ client, headers }) =>
      client.setConfig({
        headers,
        payload: {
          ...(update.apiKey !== undefined
            ? { apiKey: update.apiKey === null ? null : Redacted.make(update.apiKey) }
            : {}),
          ...(update.voiceId !== undefined ? { voiceId: update.voiceId } : {}),
          ...(update.modelId !== undefined ? { modelId: update.modelId } : {}),
        },
      }),
  });

export const getTtsVoices = (environmentId: EnvironmentId) =>
  request(environmentId, {
    method: "GET",
    url: (urls) => urls.voices(),
    request: ({ client, headers }) => client.voices({ headers }),
  });

export const synthesizeSpeech = (environmentId: EnvironmentId, text: string) =>
  request(environmentId, {
    method: "POST",
    url: (urls) => urls.speech(),
    timeoutMs: 95_000,
    request: ({ client, headers }) => client.speech({ headers, payload: { text } }),
  });

type ConnectionServices =
  typeof connectionAtomRuntime extends Atom.AtomRuntime<infer R, infer _E> ? R : never;

/** Runs a request in the app's connection runtime. */
export function runTts<A, E>(
  effect: Effect.Effect<A, E, ConnectionServices>,
  options?: Effect.RunOptions,
): Promise<A> {
  return Effect.runPromise(
    AtomRegistry.getResult(appAtomRegistry, connectionAtomRuntime).pipe(
      Effect.flatMap((context) => Effect.provide(effect, context)),
    ),
    options,
  );
}
