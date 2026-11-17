/** FORK(tts): the Read aloud section of Settings > Voice. Fork-only; see FORK.md. */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";

import { useOptionalSettingsScope } from "../../components/settings/SettingsScopeContext";
import { SettingsRow, SettingsSection } from "../../components/settings/settingsLayout";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useEnvironments } from "../../state/environments";
import { TtsKeyForm, TtsModelSelect, TtsVoiceSelect } from "./TtsControls";
import { ttsSetupAtom } from "./ttsSetupState";

export function ReadAloudSettings() {
  const { environments } = useEnvironments();
  const target = useOptionalSettingsScope()?.target?.environmentId;
  const [chosen, setChosen] = useState<EnvironmentId | null>(null);
  const ids = environments.map((environment) => environment.environmentId);
  const environmentId =
    (chosen && ids.includes(chosen) ? chosen : null) ??
    (target && ids.includes(target) ? target : null) ??
    ids[0] ??
    null;

  return (
    <SettingsSection id="read-aloud" title="Read aloud">
      {environments.length > 1 && environmentId ? (
        <SettingsRow
          title="Environment"
          description="Each environment's server keeps its own ElevenLabs key and voice."
          control={
            <Select
              value={environmentId}
              items={Object.fromEntries(
                environments.map((environment) => [environment.environmentId, environment.label]),
              )}
              onValueChange={(next) => typeof next === "string" && setChosen(next as EnvironmentId)}
            >
              <SelectTrigger aria-label="Environment" className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {environments.map((environment) => (
                  <SelectItem key={environment.environmentId} value={environment.environmentId}>
                    {environment.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      ) : null}
      {environmentId ? (
        <ReadAloudRows key={environmentId} environmentId={environmentId} />
      ) : (
        <SettingsRow
          title="ElevenLabs"
          description="Connect an environment to set up read aloud."
        />
      )}
    </SettingsSection>
  );
}

function ReadAloudRows({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const result = useAtomValue(ttsSetupAtom(environmentId));
  if (!AsyncResult.isSuccess(result)) {
    return <SettingsRow title="ElevenLabs" description="Loading…" />;
  }
  const data = result.value;
  const configured = data.config?.configured === true;
  return (
    <>
      <SettingsRow
        title="ElevenLabs API key"
        description={
          configured
            ? "Saved on this environment's server. Messages you play are sent to ElevenLabs."
            : "Add a key to play assistant messages aloud. It's stored on the server, not in the browser."
        }
      >
        <div className="mt-3 pb-2">
          <TtsKeyForm environmentId={environmentId} data={data} />
        </div>
      </SettingsRow>
      {configured ? (
        <>
          <SettingsRow
            title="Voice"
            description="Used for every message you play. You can also switch it from a message's voice menu."
            control={<TtsVoiceSelect environmentId={environmentId} data={data} />}
          />
          <SettingsRow
            title="Model"
            description="Flash is fastest and cheapest. v3 is the most expressive."
            control={<TtsModelSelect environmentId={environmentId} data={data} />}
          />
        </>
      ) : null}
      {data.error ? (
        <SettingsRow
          title="Couldn't reach ElevenLabs"
          description={<span className="text-destructive">{data.error}</span>}
        />
      ) : null}
    </>
  );
}
