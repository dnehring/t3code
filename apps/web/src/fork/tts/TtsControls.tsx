/**
 * FORK(tts): the key, voice, and model controls, shared by the setup dialog and
 * the Settings section. Voice and model save as soon as they change.
 */
import { FORK_TTS_MODELS, type EnvironmentId } from "@t3tools/contracts";
import { useId, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ttsErrorMessage } from "./ttsErrors";
import { saveTtsSetup, type TtsSetupData } from "./ttsSetupState";

export const AUTO_VOICE = "__auto__";

/** Voice choices, with the account's first voice standing in until one is picked. */
export function voiceChoices(data: TtsSetupData): Record<string, string> {
  return {
    [AUTO_VOICE]: "First voice on the account",
    ...Object.fromEntries(
      (data.voices ?? []).map((voice) => [
        voice.id,
        voice.category ? `${voice.name} (${voice.category})` : voice.name,
      ]),
    ),
  };
}

function useSaver(environmentId: EnvironmentId) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = (update: Parameters<typeof saveTtsSetup>[1], onDone?: () => void) => {
    setSaving(true);
    setError(null);
    saveTtsSetup(environmentId, update).then(
      () => {
        setSaving(false);
        onDone?.();
      },
      (cause: unknown) => {
        setSaving(false);
        setError(ttsErrorMessage(cause));
      },
    );
  };
  return { error, saving, save };
}

export function TtsVoiceSelect({
  environmentId,
  data,
  id,
}: {
  readonly environmentId: EnvironmentId;
  readonly data: TtsSetupData;
  readonly id?: string;
}) {
  const { error, saving, save } = useSaver(environmentId);
  const items = voiceChoices(data);
  const value = data.config?.voiceId ?? AUTO_VOICE;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Select
        value={value in items ? value : AUTO_VOICE}
        items={items}
        disabled={saving || data.voices === null}
        onValueChange={(next) => {
          if (typeof next !== "string" || next === value) return;
          save({ voiceId: next === AUTO_VOICE ? null : next });
        }}
      >
        <SelectTrigger id={id} aria-label="Voice" className="min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {Object.entries(items).map(([voice, label]) => (
            <SelectItem key={voice} value={voice}>
              {label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TtsModelSelect({
  environmentId,
  data,
  id,
}: {
  readonly environmentId: EnvironmentId;
  readonly data: TtsSetupData;
  readonly id?: string;
}) {
  const { error, saving, save } = useSaver(environmentId);
  const value = data.config?.modelId ?? FORK_TTS_MODELS[0].id;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Select
        value={value}
        items={Object.fromEntries(FORK_TTS_MODELS.map((model) => [model.id, model.label]))}
        disabled={saving || data.config === null}
        onValueChange={(next) => {
          if (typeof next === "string" && next !== value) save({ modelId: next });
        }}
      >
        <SelectTrigger id={id} aria-label="Model" className="min-w-0">
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
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TtsKeyForm({
  environmentId,
  data,
  onSaved,
  id,
}: {
  readonly environmentId: EnvironmentId;
  readonly data: TtsSetupData;
  readonly onSaved?: () => void;
  readonly id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [apiKey, setApiKey] = useState("");
  const { error, saving, save } = useSaver(environmentId);
  const configured = data.config?.configured === true;
  return (
    <form
      className="flex min-w-0 flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const key = apiKey.trim();
        if (!key) return;
        save({ apiKey: key }, () => {
          setApiKey("");
          onSaved?.();
        });
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={inputId}
          aria-label="ElevenLabs API key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={configured ? "Saved. Enter a new key to replace it." : "ElevenLabs API key"}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={saving || !apiKey.trim()}>
          {configured ? "Replace" : "Save"}
        </Button>
        {configured ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => save({ apiKey: null })}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </form>
  );
}
