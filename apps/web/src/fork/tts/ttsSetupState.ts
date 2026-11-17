/**
 * FORK(tts): each environment's ElevenLabs config and voice list, shared by the
 * Settings section and every message's voice menu. Fork-only; see FORK.md.
 */
import type { EnvironmentId, ForkTtsConfig, ForkTtsVoice } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { getTtsConfig, getTtsVoices, runTts, setTtsConfig } from "./ttsApi";
import { ttsErrorMessage } from "./ttsErrors";
import { clearTtsCache } from "./ttsPlayer";

export interface TtsSetupData {
  readonly config: ForkTtsConfig | null;
  readonly voices: ReadonlyArray<ForkTtsVoice> | null;
  readonly error: string | null;
}

/** Never rejects: a failure becomes `error` so the UI can show it beside the controls. */
async function loadTtsSetup(environmentId: EnvironmentId): Promise<TtsSetupData> {
  let config: ForkTtsConfig;
  try {
    config = await runTts(getTtsConfig(environmentId));
  } catch (cause) {
    return { config: null, voices: null, error: ttsErrorMessage(cause) };
  }
  if (!config.configured) return { config, voices: null, error: null };
  try {
    const { voices } = await runTts(getTtsVoices(environmentId));
    return { config, voices, error: null };
  } catch (cause) {
    return { config, voices: null, error: ttsErrorMessage(cause) };
  }
}

/** Loads on first read and stays cached; `saveTtsSetup` refreshes it. */
export const ttsSetupAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(Effect.promise(() => loadTtsSetup(environmentId))).pipe(Atom.keepAlive),
);

/** Rejects with the server's explanation when the change is refused. */
export async function saveTtsSetup(
  environmentId: EnvironmentId,
  update: Parameters<typeof setTtsConfig>[1],
): Promise<void> {
  await runTts(setTtsConfig(environmentId, update));
  // Audio made with the old voice or model must not replay.
  clearTtsCache();
  appAtomRegistry.refresh(ttsSetupAtom(environmentId));
}
