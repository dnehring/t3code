import { ForkTtsError } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import { isMissingKeyError, ttsErrorMessage } from "./ttsErrors";

it("finds the server's error inside the request layer's fetch error", () => {
  const server = new ForkTtsError({ reason: "missing-key" });
  const wrapped = Object.assign(new Error("Failed to fetch remote environment endpoint"), {
    cause: server,
  });
  expect(isMissingKeyError(wrapped)).toBe(true);
  expect(ttsErrorMessage(wrapped)).toBe(server.message);
  expect(isMissingKeyError(new ForkTtsError({ reason: "rate-limit" }))).toBe(false);
  expect(ttsErrorMessage(new Error("offline"))).toBe("offline");
  expect(ttsErrorMessage("nope")).toBe("Couldn't play this message.");
});
