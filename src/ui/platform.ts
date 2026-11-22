import type { TorrentResult } from "../sources/types";

export interface Platform {
  id: string;
  label: string;
  // Release-group tags as scene and P2P releases write them. Matched exactly
  // and case-sensitively against a whole token: "NF" is Netflix, "nf" and
  // "Max" in a title are not anything.
  tags: readonly string[];
  // Whole words that name it outright, matched case-insensitively.
  words: readonly string[];
  // Extra names the list filter answers to, so "amazon" finds Prime Video.
  aliases?: string;
}

export const PLATFORMS: readonly Platform[] = [
  { id: "netflix", label: "Netflix", tags: ["NF"], words: ["netflix"] },
  { id: "prime", label: "Prime Video", tags: ["AMZN"], words: ["amazon"], aliases: "amazon prime" },
  { id: "appletv", label: "Apple TV+", tags: ["ATVP"], words: [], aliases: "apple tv appletv" },
  { id: "disney", label: "Disney+", tags: ["DSNP"], words: ["disney"], aliases: "disney plus" },
  { id: "max", label: "Max", tags: ["HMAX", "MAX"], words: [], aliases: "hbo" },
  { id: "hulu", label: "Hulu", tags: ["HULU"], words: ["hulu"] },
  { id: "peacock", label: "Peacock", tags: ["PCOK"], words: ["peacock"] },
  { id: "paramount", label: "Paramount+", tags: ["PMTP"], words: ["paramount"], aliases: "paramount plus" },
  { id: "crunchyroll", label: "Crunchyroll", tags: ["CR"], words: ["crunchyroll"] },
  { id: "showtime", label: "Showtime", tags: ["SHO"], words: ["showtime"] },
  { id: "starz", label: "Starz", tags: ["STZ"], words: ["starz"] },
  { id: "stan", label: "Stan", tags: ["STAN"], words: [] },
];

const TOKEN_SPLIT = /[\s._()[\]{},+-]+/;

// The streaming service a release was ripped from, read off the tag in its
// name ("Show.S01E01.1080p.NF.WEB-DL" is Netflix), or null when it names none.
export function detectPlatform(name: string): Platform | null {
  for (const token of name.split(TOKEN_SPLIT)) {
    if (!token) continue;
    const lower = token.toLowerCase();
    for (const p of PLATFORMS) {
      if (p.tags.includes(token) || p.words.includes(lower)) return p;
    }
  }
  return null;
}

// The platform's names for the list filter's text match, or "" for none.
export function platformSearchText(r: TorrentResult): string {
  const p = detectPlatform(r.name);
  return p ? `${p.label} ${p.aliases ?? ""}`.toLowerCase() : "";
}

// The platforms present in a list, in the order PLATFORMS gives, for the `v`
// key to step through.
export function platformsIn(list: TorrentResult[]): Platform[] {
  const seen = new Set<string>();
  for (const r of list) {
    const p = detectPlatform(r.name);
    if (p) seen.add(p.id);
  }
  return PLATFORMS.filter((p) => seen.has(p.id));
}
