import { htmlToText } from "../describe/text";
import { tmdbGet, type TmdbOptions } from "./client";
import type { TitleKind } from "./top";

interface SearchRow {
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  poster_path?: string | null;
}

export interface TitleMatch {
  // TMDB poster path, e.g. "/abc.jpg".
  poster: string;
}

const bare = (s: string): string => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{N}]/gu, "");

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 100;
const cache = new Map<string, { at: number; value: TitleMatch | null }>();

// The TMDB entry for a title taken from a release name, with its poster. Only
// an entry whose title (or original title) is the searched title counts, so a
// near miss never lends a stranger's poster; among those, the one from the
// release's year wins when the name gives one, then the most popular, which
// is the order TMDB answers in.
export async function searchTitle(
  kind: TitleKind,
  title: string,
  year: number | undefined,
  opts: TmdbOptions = {},
): Promise<TitleMatch | null> {
  const key = `${kind}|${title.toLowerCase()}|${year ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const json = await tmdbGet<{ results?: SearchRow[] }>(
    `/search/${kind}`,
    { query: title, include_adult: "false", language: "en-US" },
    opts,
  );
  const want = bare(title);
  const matches = (json.results ?? []).filter((r) => {
    if (!r.poster_path || !/^\/[A-Za-z0-9_-]{1,64}\.jpg$/.test(r.poster_path)) return false;
    const names = kind === "tv" ? [r.name, r.original_name] : [r.title, r.original_title];
    return names.some((n) => n && bare(htmlToText(n)) === want);
  });
  const dated = (r: SearchRow): string => (kind === "tv" ? r.first_air_date : r.release_date) ?? "";
  const pick = (year && matches.find((r) => dated(r).startsWith(String(year)))) || matches[0];
  const value = pick?.poster_path ? { poster: pick.poster_path } : null;

  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}
