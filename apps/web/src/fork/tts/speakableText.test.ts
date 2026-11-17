import { describe, expect, it } from "vite-plus/test";

import { speakableText, speechChunks } from "./speakableText";

describe("speakableText", () => {
  it.each([
    ["## Summary", "Summary."],
    ["- Run `vp test` first", "Run vp test first"],
    ["1. **Bold** and *italic* and ~~gone~~", "Bold and italic and gone"],
    ["See [the docs](https://example.com) or https://x.dev/a", "See the docs or link"],
    ["> quoted <kbd>text</kbd>", "quoted text"],
    ["keep snake_case_names and 2*3*4", "keep snake_case_names and 2*3*4"],
    ["| File | Lines |\n| --- | ---: |\n| a.ts | 12 |", "File, Lines.\n\na.ts, 12."],
    ["Before\n\n---\n\nAfter", "Before\n\nAfter"],
  ])("reads %j as %j", (markdown, spoken) => {
    expect(speakableText(markdown)).toBe(spoken);
  });

  it("announces code blocks instead of reading them, including unclosed ones", () => {
    expect(speakableText("Try this:\n\n```ts\nconst a = 1;\n```\n\nThen run it.")).toBe(
      "Try this:\n\nCode block skipped.\n\nThen run it.",
    );
    expect(speakableText("Start\n~~~\nnever closed")).toBe("Start\n\nCode block skipped.");
  });
});

describe("speechChunks", () => {
  it("keeps the first chunk short and packs sentences up to the limit", () => {
    const text = "One two. Three four. Five six.\n\nSeven eight.";
    expect(speechChunks(text, { first: 10, rest: 30 })).toEqual([
      "One two.",
      "Three four. Five six.",
      "Seven eight.",
    ]);
  });

  it("breaks an oversized sentence at a word boundary", () => {
    const chunks = speechChunks("alpha beta gamma delta epsilon", { first: 12, rest: 12 });
    expect(chunks).toEqual(["alpha beta", "gamma delta", "epsilon"]);
    expect(chunks.every((chunk) => chunk.length <= 12)).toBe(true);
  });

  it("returns nothing for text with no words", () => {
    expect(speechChunks("  \n\n ")).toEqual([]);
  });
});
