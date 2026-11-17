/** FORK(tts): ElevenLabs key, voice, and model for one environment. Fork-only; see FORK.md. */
import {
  FORK_TTS_MODELS,
  type EnvironmentId,
  type ForkTtsConfig,
  type ForkTtsVoice,
} from "@t3tools/contracts";
import { useId, useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { getTtsConfig, getTtsVoices, runTts, setTtsConfig } from "./ttsApi";
import { ttsErrorMessage } from "./ttsErrors";
import { clearTtsCache } from "./ttsPlayer";

const AUTO_VOICE = "__auto__";

export interface TtsSetupData {
  readonly config: ForkTtsConfig | null;
  readonly voices: ReadonlyArray<ForkTtsVoice> | null;
  readonly error: string | null;
}

/** Reads what the dialog shows. Called by the click that opens it. */
export async function loadTtsSetup(environmentId: EnvironmentId): Promise<TtsSetupData> {
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

async function saveTtsSetup(
  environmentId: EnvironmentId,
  update: Parameters<typeof setTtsConfig>[1],
): Promise<TtsSetupData> {
  await runTts(setTtsConfig(environmentId, update));
  // Audio made with the old voice or model must not replay.
  clearTtsCache();
  return loadTtsSetup(environmentId);
}

export function TtsSetupDialog({
  environmentId,
  initial,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly initial: TtsSetupData;
  readonly onClose: (saved: boolean) => void;
}) {
  const id = useId();
  const [data, setData] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [voiceId, setVoiceId] = useState(initial.config?.voiceId ?? AUTO_VOICE);
  const [modelId, setModelId] = useState<string>(initial.config?.modelId ?? FORK_TTS_MODELS[0].id);
  const [error, setError] = useState(initial.error);
  const [saving, setSaving] = useState(false);

  const save = (update: Parameters<typeof setTtsConfig>[1], close: boolean) => {
    setSaving(true);
    setError(null);
    saveTtsSetup(environmentId, update).then(
      (next) => {
        setSaving(false);
        if (close && next.config?.configured) {
          onClose(true);
          return;
        }
        setData(next);
        setError(next.error);
        setApiKey("");
      },
      (cause: unknown) => {
        setSaving(false);
        setError(ttsErrorMessage(cause));
      },
    );
  };

  const configured = data.config?.configured === true;
  const voiceItems: Record<string, string> = {
    [AUTO_VOICE]: "First voice on the account",
    ...Object.fromEntries((data.voices ?? []).map((voice) => [voice.id, voice.name])),
  };
  const modelItems = Object.fromEntries(FORK_TTS_MODELS.map((model) => [model.id, model.label]));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmedKey = apiKey.trim();
            if (!configured && !trimmedKey) {
              setError("Enter an ElevenLabs API key.");
              return;
            }
            save(
              {
                ...(trimmedKey ? { apiKey: trimmedKey } : {}),
                voiceId: voiceId === AUTO_VOICE ? null : voiceId,
                modelId,
              },
              true,
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Read aloud</DialogTitle>
            <DialogDescription>
              Assistant messages are sent to ElevenLabs to generate audio. The key is stored on this
              environment's server, not in the browser.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <Label className="flex flex-col items-stretch" htmlFor={`${id}-key`}>
                ElevenLabs API key
                <Input
                  id={`${id}-key`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={configured ? "Saved. Enter a new key to replace it." : "xi-..."}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </Label>
              {configured && data.voices !== null ? (
                <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-voice`}>
                  Voice
                  <Select
                    value={voiceId}
                    items={voiceItems}
                    onValueChange={(value) => typeof value === "string" && setVoiceId(value)}
                  >
                    <SelectTrigger id={`${id}-voice`} className="min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {Object.entries(voiceItems).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Label>
              ) : null}
              <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-model`}>
                Model
                <Select
                  value={modelId}
                  items={modelItems}
                  onValueChange={(value) => typeof value === "string" && setModelId(value)}
                >
                  <SelectTrigger id={`${id}-model`} className="min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {FORK_TTS_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Label>
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-destructive text-sm">
                {error}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            {configured ? (
              <Button
                type="button"
                variant="ghost-muted"
                className="sm:mr-auto"
                disabled={saving}
                onClick={() => save({ apiKey: null }, false)}
              >
                Remove key
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || data.config === null}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
