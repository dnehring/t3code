/** FORK(tts): first-time setup, opened from a message when no key is saved yet. See FORK.md. */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useId } from "react";

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
import { Label } from "../../components/ui/label";
import { TtsKeyForm, TtsModelSelect, TtsVoiceSelect } from "./TtsControls";
import { ttsSetupAtom } from "./ttsSetupState";

export function TtsSetupDialog({
  environmentId,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly onClose: (configured: boolean) => void;
}) {
  const id = useId();
  const result = useAtomValue(ttsSetupAtom(environmentId));
  const data = AsyncResult.isSuccess(result) ? result.value : null;
  const configured = data?.config?.configured === true;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose(configured);
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Read aloud</DialogTitle>
          <DialogDescription>
            Assistant messages you play are sent to ElevenLabs to generate audio. The key is stored
            on this environment's server, not in the browser.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {data === null ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-key`}>ElevenLabs API key</Label>
                <TtsKeyForm environmentId={environmentId} data={data} id={`${id}-key`} />
              </div>
              {configured ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${id}-voice`}>Voice</Label>
                    <TtsVoiceSelect environmentId={environmentId} data={data} id={`${id}-voice`} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${id}-model`}>Model</Label>
                    <TtsModelSelect environmentId={environmentId} data={data} id={`${id}-model`} />
                  </div>
                </>
              ) : null}
              {data.error ? (
                <p role="alert" className="text-destructive text-sm">
                  {data.error}
                </p>
              ) : null}
            </div>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" onClick={() => onClose(configured)}>
            {configured ? "Done" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
