import { getSource } from "../sources/registry";
import type { TorrentResult } from "../sources/types";
import { tmdbKey, type TmdbOptions } from "../tmdb/client";
import { isPosterUrl, type PosterSource } from "../tmdb/poster";
import { searchTitle } from "../tmdb/search";
import type { TitleKind } from "../tmdb/top";
import { parseRelease } from "./parse";

interface PosterPlan {
  kind: TitleKind;
  title: string;
  year?: number;
}

// An anime release names its episode as " - 1173" after the title; the title
// is what TMDB knows it by.
const ANIME_EPISODE = /\s+-\s+\d+(?:v\d+)?$/;

// What to look a result's poster up as, or null when it should not get one:
// games have no poster service here, TORLINK_NO_DESCRIPTIONS turns every
// title lookup off, and a Movies and TV source whose name gives no hint is
// left alone, the same as for descriptions.
function plan(r: TorrentResult): PosterPlan | null {
  if (process.env.TORLINK_NO_DESCRIPTIONS) return null;
  const info = parseRelease(r.name);
  if (!info) return null;
  const groups = getSource(r.source).groups ?? [];
  const movies = groups.includes("Movies");
  const tv = groups.includes("TV");
  if (groups.includes("Anime") && !movies && !tv) {
    const title = info.title.replace(ANIME_EPISODE, "").trim();
    return title ? { kind: "tv", title, year: info.year } : null;
  }
  if (!movies && !tv) return null;
  if (info.season !== undefined) return tv || !movies ? { kind: "tv", title: info.title, year: info.year } : null;
  if (movies && !tv) return { kind: "movie", title: info.title, year: info.year };
  if (tv && !movies) return { kind: "tv", title: info.title, year: info.year };
  return info.year !== undefined ? { kind: "movie", title: info.title, year: info.year } : null;
}

// Sync, so the details pane knows whether to hold a spot for a poster.
export function canPoster(r: TorrentResult): boolean {
  return plan(r) !== null;
}

// The poster for a result: TMDB's when a key is set and it knows the title,
// otherwise the one the description lookup already found (TVmaze or Wikipedia).
// Null when neither has one; a network failure on the TMDB lookup falls back
// the same way instead of failing.
export async function findPoster(
  r: TorrentResult,
  fallback: string | undefined,
  opts: TmdbOptions = {},
): Promise<PosterSource | null> {
  const p = plan(r);
  if (!p) return null;
  if (tmdbKey()) {
    try {
      const match = await searchTitle(p.kind, p.title, p.year, opts);
      if (match) return { tmdb: match.poster };
    } catch {
      // fall through to the keyless poster
    }
  }
  return fallback && isPosterUrl(fallback) ? { url: fallback } : null;
}
