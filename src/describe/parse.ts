export interface ReleaseInfo {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
}

const EPISODE = /\bS(\d{1,2})\s?E(\d{1,3})\b|\b(\d{1,2})x(\d{2,3})\b/i;
const SEASON = /\bS(\d{1,2})\b|\bSeasons? (\d{1,2})\b/i;
const YEAR = /(?:^|[\s(\[])((?:19|20)\d{2})(?=[\s)\]]|$)/g;
const QUALITY =
  /\b(?:2160p|1080p|720p|480p|4k|uhd|web[- ]?dl|webrip|web|bluray|blu-ray|brrip|bdrip|hdrip|hdtv|dvdrip|remux|x264|x265|h\.?26[45]|hevc|avc|complete|repack|proper)\b/i;

// Pull a title, a year and any season/episode out of a release name such as
// "Breaking.Bad.S02E03.1080p.BluRay" or "Dune (2021) [1080p] [WEBRip]". Cuts
// the title at the first of those markers. Returns null when nothing title-like
// is left, so a name that is all tags never turns into a lookup.
export function parseRelease(name: string): ReleaseInfo | null {
  const s = name
    .replace(/^\s*(?:\[[^\]]*\]\s*)+/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const info: ReleaseInfo = { title: "" };
  const cuts: number[] = [];

  const ep = EPISODE.exec(s);
  if (ep) {
    info.season = Number(ep[1] ?? ep[3]);
    info.episode = Number(ep[2] ?? ep[4]);
    cuts.push(ep.index);
  } else {
    const se = SEASON.exec(s);
    if (se) {
      info.season = Number(se[1] ?? se[2]);
      cuts.push(se.index);
    }
  }

  // A leading number is part of the title ("2012 (2009)"), so a year only
  // counts once something precedes it.
  for (const m of s.matchAll(YEAR)) {
    const at = m.index + m[0].length - m[1]!.length;
    if (at > 0) {
      info.year = Number(m[1]);
      cuts.push(at);
      break;
    }
  }

  const q = QUALITY.exec(s);
  if (q) cuts.push(q.index);

  const end = cuts.length > 0 ? Math.min(...cuts) : s.length;
  info.title = s
    .slice(0, end)
    .replace(/[([{\-–:,\s]+$/, "")
    .replace(/^[)\]}\-–:,\s]+/, "")
    .trim();
  return info.title ? info : null;
}
