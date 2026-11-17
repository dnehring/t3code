/** FORK(tts): turns request failures into what the read-aloud UI shows. See FORK.md. */
import { ForkTtsError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isForkTtsError = Schema.is(ForkTtsError);

/** The server's own explanation, which the request layer wraps in a fetch error's `cause`. */
function findForkTtsError(error: unknown): ForkTtsError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if (isForkTtsError(current)) return current;
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

export function ttsErrorMessage(error: unknown): string {
  const server = findForkTtsError(error);
  if (server) return server.message;
  if (error instanceof Error && error.message) return error.message;
  return "Couldn't play this message.";
}

export function isMissingKeyError(error: unknown): boolean {
  return findForkTtsError(error)?.reason === "missing-key";
}
