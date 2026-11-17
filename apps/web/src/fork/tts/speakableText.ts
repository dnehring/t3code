/**
 * FORK(tts): turns assistant Markdown into text worth listening to, then splits it
 * into requests the ElevenLabs endpoint accepts. Fork-only; see FORK.md.
 */
import { FORK_TTS_MAX_CHUNK_CHARS } from "@t3tools/contracts";

const CODE_BLOCK_SPOKEN = "Code block skipped.";

/** Markdown to plain prose. Code blocks are announced, not read character by character. */
export function speakableText(markdown: string): string {
  const lines: string[] = [];
  let fence: string | null = null;
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1]!.startsWith(fence)) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      lines.push("", CODE_BLOCK_SPOKEN, "");
      continue;
    }
    lines.push(speakableLine(raw));
  }
  return lines
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function speakableLine(line: string): string {
  // Table separators and horizontal rules carry no words.
  if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) return "";
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return "";
  let text = line
    .replace(/<[^>\n]+>/g, "")
    .replace(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/, (_, heading: string) => withStop(heading))
    .replace(/^\s*(>\s?)+/, "")
    .replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\bhttps?:\/\/\S+/g, "link")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1");
  // Table rows read as a list of their cells.
  if (/^\s*\|.*\|\s*$/.test(text)) {
    text = withStop(
      text
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(", "),
    );
  }
  return text;
}

function withStop(text: string): string {
  const trimmed = text.trim();
  return trimmed === "" || /[.!?:;]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export interface SpeechChunkSizes {
  /** Kept short so the first audio arrives quickly. */
  readonly first: number;
  readonly rest: number;
}

const DEFAULT_SIZES: SpeechChunkSizes = { first: 400, rest: FORK_TTS_MAX_CHUNK_CHARS };

/**
 * Splits prose into requests no longer than the limits, breaking at paragraphs,
 * then sentences, then words, so audio never stops mid-word.
 */
export function speechChunks(text: string, sizes: SpeechChunkSizes = DEFAULT_SIZES): string[] {
  const pieces = text
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((piece) => piece.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const limit = () => (chunks.length === 0 ? sizes.first : sizes.rest);
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const piece of pieces) {
    for (const part of splitLong(piece, sizes.rest)) {
      const joined = current ? `${current} ${part}` : part;
      if (joined.length <= limit()) {
        current = joined;
        continue;
      }
      flush();
      current = part;
      // A first piece longer than the short first limit still goes alone.
      if (current.length > limit()) flush();
    }
  }
  flush();
  return chunks;
}

function splitLong(piece: string, max: number): string[] {
  const parts: string[] = [];
  let rest = piece;
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
