import { htmlToText } from "../describe/text";
import { tmdbGet, tmdbRegion, type TmdbOptions } from "./client";

export type TitleKind = "tv" | "movie";

// TMDB's ids for each streaming service (the same ids JustWatch uses), keyed
// by torlink's platform ids.
export const PROVIDER_IDS: Record<string, number> = {
  netflix: 8,
  prime: 9,
  appletv: 350,
  disney: 337,
  max: 1899,
  hulu: 15,
  peacock: 386,
  paramount: 531,
};

export interface TopTitle {
  id: number;
  kind: TitleKind;
  title: string;
  year?: string;
  // TMDB's 0-10 user score; undefined when nobody has voted.
  rating?: number;
  overview: string;
  // TMDB's popularity score, used to merge ranked lists.
  popularity?: number;
  // TMDB poster path, e.g. "/abc.jpg"; resolved by fetchPoster.
  poster?: string;
}

export interface Season {
  number: number;
  name: string;
  episodes: number;
}

export interface TitleDetails {
  genres: string[];
  tagline?: string;
  // A film's running time in minutes.
  runtime?: number;
  status?: string;
  // A show's seasons, specials (season 0) left out.
  seasons: Season[];
}

export interface Episode {
  number: number;
  name: string;
  overview: string;
  airDate?: string;
}

interface DiscoverRow {
  id?: number;
  name?: string;
  title?: string;
  first_air_date?: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
}

const MAX_TITLES = 20;

// The newest `count` calendar years, newest first: the years the Top picks
// year view steps through.
export function recentYears(now: Date = new Date(), count = 5): number[] {
  return Array.from({ length: count }, (_, i) => now.getFullYear() - i);
}

// Remote text goes through the same flattening and control-character strip as
// every other remote string: it lands in the terminal.
const clean = (s: string | undefined): string => htmlToText(s ?? "");

export function mapTopTitles(rows: DiscoverRow[], kind: TitleKind): TopTitle[] {
  const out: TopTitle[] = [];
  for (const r of rows) {
    const title = clean(kind === "tv" ? r.name : r.title);
    if (typeof r.id !== "number" || !title) continue;
    const date = kind === "tv" ? r.first_air_date : r.release_date;
    out.push({
      id: r.id,
      kind,
      title,
      year: date && /^\d{4}/.test(date) ? date.slice(0, 4) : undefined,
      rating: r.vote_count && r.vote_average ? Math.round(r.vote_average * 10) / 10 : undefined,
      overview: clean(r.overview),
      popularity: typeof r.popularity === "number" ? r.popularity : undefined,
      poster: r.poster_path || undefined,
    });
  }
  return out.slice(0, MAX_TITLES);
}

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// The discover filters that mean "this year". A film is one released that
// year. A show counts two ways, asked separately and merged: it debuted that
// year, or it has episodes airing that year. Neither alone is enough: the debut
// year misses a returning show in every later year, and the air-date range
// misses a new show TMDB has no episode dates for yet.
function yearFilters(kind: TitleKind, year: number | undefined): Record<string, string>[] {
  if (year === undefined) return [{}];
  if (kind === "movie") return [{ primary_release_year: String(year) }];
  return [
    { first_air_date_year: String(year) },
    { "air_date.gte": `${year}-01-01`, "air_date.lte": `${year}-12-31` },
  ];
}

// What is most popular on a platform, for shows or for films, among titles
// streaming included with a subscription in the user's region. With a `year`,
// a film is one released that year and a show is one that debuted or has
// episodes airing that year, so a returning show counts for every year it is on
// air; without a year, whatever is popular right now.
export async function topTitles(
  platformId: string,
  kind: TitleKind,
  opts: TmdbOptions & { year?: number } = {},
): Promise<TopTitle[]> {
  const provider = PROVIDER_IDS[platformId];
  if (provider === undefined) return [];
  const region = tmdbRegion();
  const { year, ...request } = opts;
  return cached(`top|${platformId}|${kind}|${region}|${year ?? "now"}`, async () => {
    const asks = yearFilters(kind, year).map((filter) =>
      tmdbGet<{ results?: DiscoverRow[] }>(
        `/discover/${kind}`,
        {
          with_watch_providers: String(provider),
          watch_region: region,
          with_watch_monetization_types: "flatrate",
          sort_by: "popularity.desc",
          language: "en-US",
          ...filter,
        },
        request,
      ),
    );
    // One ask failing leaves the other's list; both failing is an error.
    const settled = await Promise.allSettled(asks);
    const ok = settled.filter((r): r is PromiseFulfilledResult<{ results?: DiscoverRow[] }> => r.status === "fulfilled");
    if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
    return mergeTop(ok.map((r) => mapTopTitles(r.value.results ?? [], kind)));
  });
}

// Lists merged into one: each title once, the most popular first.
export function mergeTop(lists: TopTitle[][]): TopTitle[] {
  const byId = new Map<number, TopTitle>();
  for (const t of lists.flat()) if (!byId.has(t.id)) byId.set(t.id, t);
  const merged = [...byId.values()];
  if (lists.length > 1) merged.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  return merged.slice(0, MAX_TITLES);
}

interface DetailsJson {
  genres?: { name?: string }[];
  tagline?: string;
  runtime?: number;
  status?: string;
  seasons?: { season_number?: number; name?: string; episode_count?: number }[];
}

export async function titleDetails(
  kind: TitleKind,
  id: number,
  opts: TmdbOptions = {},
): Promise<TitleDetails> {
  return cached(`details|${kind}|${id}`, async () => {
    const json = await tmdbGet<DetailsJson>(`/${kind}/${id}`, { language: "en-US" }, opts);
    return {
      genres: (json.genres ?? []).map((g) => clean(g.name)).filter(Boolean),
      tagline: clean(json.tagline) || undefined,
      runtime: json.runtime && json.runtime > 0 ? json.runtime : undefined,
      status: clean(json.status) || undefined,
      seasons: (json.seasons ?? [])
        .filter((s) => typeof s.season_number === "number" && s.season_number > 0)
        .map((s) => ({
          number: s.season_number!,
          name: clean(s.name) || `Season ${s.season_number}`,
          episodes: s.episode_count ?? 0,
        })),
    };
  });
}

export async function seasonEpisodes(
  id: number,
  season: number,
  opts: TmdbOptions = {},
): Promise<Episode[]> {
  return cached(`season|${id}|${season}`, async () => {
    const json = await tmdbGet<{
      episodes?: { episode_number?: number; name?: string; overview?: string; air_date?: string | null }[];
    }>(`/tv/${id}/season/${season}`, { language: "en-US" }, opts);
    return (json.episodes ?? [])
      .filter((e) => typeof e.episode_number === "number")
      .map((e) => ({
        number: e.episode_number!,
        name: clean(e.name) || `Episode ${e.episode_number}`,
        overview: clean(e.overview),
        airDate: e.air_date && /^\d{4}-\d{2}-\d{2}$/.test(e.air_date) ? e.air_date : undefined,
      }));
  });
}
