/**
 * FORK(tts): play, pause, and resume an assistant message with ElevenLabs, plus a
 * voice menu. Rendered next to the copy button; fork-only, see FORK.md.
 */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  Volume2Icon,
  VolumeXIcon,
  type LucideIcon,
} from "lucide-react";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../../components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { AUTO_VOICE, voiceChoices } from "./TtsControls";
import { TtsSetupDialog } from "./TtsSetupDialog";
import { pausePlayback, playMessage, resumePlayback, stopPlayback, useTtsState } from "./ttsPlayer";
import { saveTtsSetup, ttsSetupAtom } from "./ttsSetupState";

export function MessageSpeakButton({
  messageKey,
  text,
  streaming,
  environmentId,
}: {
  readonly messageKey: string;
  readonly text: string | null | undefined;
  readonly streaming: boolean;
  readonly environmentId: EnvironmentId | null | undefined;
}) {
  const tts = useTtsState();
  const [setupOpen, setSetupOpen] = useState(false);
  if (streaming || !text?.trim() || !environmentId) return null;

  const current = tts.messageKey === messageKey;
  const status = current ? tts.status : "idle";
  const play = () => void playMessage(messageKey, environmentId, text);

  const main: { label: string; icon: LucideIcon; onClick: () => void; spin?: boolean } =
    status === "loading"
      ? {
          label: "Loading audio. Click to stop.",
          icon: LoaderCircleIcon,
          onClick: stopPlayback,
          spin: true,
        }
      : status === "playing"
        ? { label: "Pause", icon: PauseIcon, onClick: pausePlayback }
        : status === "paused"
          ? { label: "Resume", icon: PlayIcon, onClick: resumePlayback }
          : status === "error"
            ? {
                label: tts.needsSetup
                  ? "Set up read aloud"
                  : `${tts.error ?? "Playback failed."} Click to retry.`,
                icon: VolumeXIcon,
                onClick: tts.needsSetup ? () => setSetupOpen(true) : play,
              }
            : { label: "Read aloud", icon: Volume2Icon, onClick: play };

  return (
    <>
      <span className="inline-flex items-center">
        <IconButton {...main} />
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <Button
                      aria-label="Read aloud voice"
                      type="button"
                      size="icon-xs"
                      variant="ghost-muted"
                    />
                  }
                />
              }
            >
              <ChevronDownIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup>
              <p>Read aloud voice</p>
            </TooltipPopup>
          </Tooltip>
          <MenuPopup align="start" side="top" className="max-h-80 overflow-y-auto">
            <VoiceMenuItems
              environmentId={environmentId}
              onSetup={() => setSetupOpen(true)}
              onVoiceChanged={() => {
                // Replay what was playing so the new voice is heard right away.
                if (current && status !== "idle" && status !== "error") play();
              }}
            />
          </MenuPopup>
        </Menu>
      </span>
      {status === "playing" || status === "paused" || status === "loading" ? (
        <IconButton label="Stop" icon={SquareIcon} onClick={stopPlayback} />
      ) : null}
      {setupOpen ? (
        <TtsSetupDialog
          environmentId={environmentId}
          onClose={(configured) => {
            setSetupOpen(false);
            if (configured && current && tts.needsSetup) play();
          }}
        />
      ) : null}
    </>
  );
}

/** Mounted only while the menu is open, so voices load on first open, not per message. */
function VoiceMenuItems({
  environmentId,
  onSetup,
  onVoiceChanged,
}: {
  readonly environmentId: EnvironmentId;
  readonly onSetup: () => void;
  readonly onVoiceChanged: () => void;
}) {
  const navigate = useNavigate();
  const result = useAtomValue(ttsSetupAtom(environmentId));
  const [saveError, setSaveError] = useState<string | null>(null);
  const settingsItem = (
    <MenuItem onClick={() => void navigate({ to: "/settings/voice", hash: "read-aloud" })}>
      Read aloud settings
    </MenuItem>
  );

  if (!AsyncResult.isSuccess(result)) {
    return <MenuItem disabled>Loading voices…</MenuItem>;
  }
  const data = result.value;
  if (!data.config?.configured) {
    return (
      <>
        <MenuItem onClick={onSetup}>Set up read aloud</MenuItem>
        {settingsItem}
      </>
    );
  }
  const items = voiceChoices(data);
  const value = data.config.voiceId ?? AUTO_VOICE;
  const error = saveError ?? data.error;
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>ElevenLabs voice</MenuGroupLabel>
        <MenuRadioGroup
          value={value in items ? value : AUTO_VOICE}
          onValueChange={(next) => {
            if (typeof next !== "string" || next === value) return;
            setSaveError(null);
            saveTtsSetup(environmentId, { voiceId: next === AUTO_VOICE ? null : next }).then(
              onVoiceChanged,
              () => setSaveError("Couldn't change the voice."),
            );
          }}
        >
          {Object.entries(items).map(([voice, label]) => (
            <MenuRadioItem key={voice} value={voice} closeOnClick>
              <span className="min-w-0 truncate">{label}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
      {error ? (
        <MenuItem disabled>
          <span className="text-destructive">{error}</span>
        </MenuItem>
      ) : null}
      <MenuSeparator />
      {settingsItem}
    </>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  spin = false,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick: () => void;
  readonly spin?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={onClick}
            type="button"
            size="xs"
            variant="ghost-muted"
          />
        }
      >
        <Icon className={spin ? "size-3 animate-spin" : "size-3"} />
      </TooltipTrigger>
      <TooltipPopup>
        <p>{label}</p>
      </TooltipPopup>
    </Tooltip>
  );
}
