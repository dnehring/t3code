/**
 * FORK(tts): one app-wide player, so starting a message stops any other. The next
 * chunk is fetched while the current one plays, and recent chunks stay cached so a
 * replay doesn't spend ElevenLabs characters twice.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { speakableText, speechChunks } from "./speakableText";
import { runTts, synthesizeSpeech } from "./ttsApi";
import { isMissingKeyError, ttsErrorMessage } from "./ttsErrors";

export type TtsStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface TtsState {
  readonly messageKey: string | null;
  readonly status: TtsStatus;
  readonly error: string | null;
  /** The environment has no ElevenLabs key yet. */
  readonly needsSetup: boolean;
}

const IDLE: TtsState = { messageKey: null, status: "idle", error: null, needsSetup: false };
const CACHE_LIMIT = 40;

let state: TtsState = IDLE;
const listeners = new Set<() => void>();
const cache = new Map<string, Promise<Blob>>();
let audio: HTMLAudioElement | null = null;
let session: { readonly id: number; readonly abort: AbortController } | null = null;
let nextSessionId = 0;

function setState(next: TtsState) {
  state = next;
  for (const listener of listeners) listener();
  updateMediaSession();
}

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  return audio;
}

function chunkAudio(environmentId: EnvironmentId, text: string, signal: AbortSignal) {
  const key = `${environmentId}\u0000${text}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const pending = runTts(synthesizeSpeech(environmentId, text), { signal }).then(
    (bytes) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/mpeg" }),
  );
  cache.set(key, pending);
  // A failed or cancelled request must not be replayed from the cache.
  pending.catch(() => cache.delete(key));
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return pending;
}

/** Drops cached audio, for example after the voice or model changes. */
export function clearTtsCache() {
  cache.clear();
}

export async function playMessage(
  messageKey: string,
  environmentId: EnvironmentId,
  markdown: string,
) {
  stopPlayback();
  const chunks = speechChunks(speakableText(markdown));
  if (chunks.length === 0) return;
  const current = { id: ++nextSessionId, abort: new AbortController() };
  session = current;
  const live = () => session?.id === current.id;
  const player = element();
  setState({ messageKey, status: "loading", error: null, needsSetup: false });

  try {
    let next = chunkAudio(environmentId, chunks[0]!, current.abort.signal);
    for (let index = 0; index < chunks.length; index++) {
      const blob = await next;
      if (!live()) return;
      if (index + 1 < chunks.length) {
        next = chunkAudio(environmentId, chunks[index + 1]!, current.abort.signal);
      }
      const url = URL.createObjectURL(blob);
      try {
        player.src = url;
        const finished = new Promise<void>((resolve, reject) => {
          player.onended = () => resolve();
          player.onerror = () => reject(new Error("The browser couldn't play the audio."));
          current.abort.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        await player.play();
        if (!live()) return;
        setState({ ...state, status: "playing" });
        await finished;
        if (!live()) return;
        // Between chunks, show loading until the next one is ready.
        if (index + 1 < chunks.length) setState({ ...state, status: "loading" });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (live()) {
      session = null;
      setState(IDLE);
    }
  } catch (error) {
    if (!live()) return;
    session = null;
    setState({
      messageKey,
      status: "error",
      error: ttsErrorMessage(error),
      needsSetup: isMissingKeyError(error),
    });
  }
}

export function pausePlayback() {
  if (state.status !== "playing") return;
  element().pause();
  setState({ ...state, status: "paused" });
}

export function resumePlayback() {
  if (state.status !== "paused") return;
  void element()
    .play()
    .then(() => setState({ ...state, status: "playing" }))
    .catch((error: unknown) =>
      setState({ ...state, status: "error", error: ttsErrorMessage(error) }),
    );
}

export function stopPlayback() {
  session?.abort.abort();
  session = null;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (state !== IDLE) setState(IDLE);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTtsState(): TtsState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Lets keyboard media keys and the OS media controls pause and resume. */
function updateMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const media = navigator.mediaSession;
  if (state.status === "idle" || state.status === "error") {
    media.playbackState = "none";
    media.setActionHandler("play", null);
    media.setActionHandler("pause", null);
    media.setActionHandler("stop", null);
    return;
  }
  media.playbackState = state.status === "paused" ? "paused" : "playing";
  media.setActionHandler("play", resumePlayback);
  media.setActionHandler("pause", pausePlayback);
  media.setActionHandler("stop", stopPlayback);
}
