/**
 * FORK(tts): play, pause, and resume an assistant message with ElevenLabs.
 * Rendered next to the copy button; fork-only, see FORK.md.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import {
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  Settings2Icon,
  SquareIcon,
  Volume2Icon,
  VolumeXIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { loadTtsSetup, TtsSetupDialog, type TtsSetupData } from "./TtsSetupDialog";
import { pausePlayback, playMessage, resumePlayback, stopPlayback, useTtsState } from "./ttsPlayer";

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
  const [setup, setSetup] = useState<TtsSetupData | null>(null);
  if (streaming || !text?.trim() || !environmentId) return null;

  const current = tts.messageKey === messageKey;
  const status = current ? tts.status : "idle";
  const play = () => void playMessage(messageKey, environmentId, text);
  const openSetup = () => void loadTtsSetup(environmentId).then(setSetup);

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
                onClick: tts.needsSetup ? openSetup : play,
              }
            : { label: "Read aloud", icon: Volume2Icon, onClick: play };

  return (
    <>
      <IconButton {...main} />
      {status === "playing" || status === "paused" || status === "loading" ? (
        <IconButton label="Stop" icon={SquareIcon} onClick={stopPlayback} />
      ) : null}
      {current && status !== "idle" ? (
        <IconButton label="Read aloud settings" icon={Settings2Icon} onClick={openSetup} />
      ) : null}
      {setup ? (
        <TtsSetupDialog
          environmentId={environmentId}
          initial={setup}
          onClose={(saved) => {
            setSetup(null);
            if (saved && current && tts.needsSetup) play();
          }}
        />
      ) : null}
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
