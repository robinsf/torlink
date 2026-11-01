import { stripControl } from "../util/format";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

// Flatten the small HTML fragments TVmaze returns into plain text, and strip
// control characters from whatever a remote service sent: this text lands in
// the terminal, so an escape sequence in it must never reach the screen.
export function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (all, dec, hex, name) => {
      const code = dec ? Number(dec) : hex ? Number.parseInt(hex, 16) : undefined;
      if (code !== undefined) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      return ENTITIES[String(name).toLowerCase()] ?? all;
    });
  return stripControl(text.replace(/\s+/g, " ")).trim();
}
