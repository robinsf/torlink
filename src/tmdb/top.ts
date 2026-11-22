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
  // Why a show is in a year's list: "New" if it debuted that year, or the
  // season ("S4") that premiered that year.
  tag?: string;
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

// TMDB answers 20 titles a page, so a list of this many is several pages.
const MAX_TITLES = 100;
const LIST_PAGES = MAX_TITLES / 20;

// The newest `count` calendar years, newest first: the years the Top picks
// year view steps through.
export function recentYears(now: Date = new Date(), count = 5): number[] {
  return Array.from({ length: count }, (_, i) => now.getFullYear() - i);
}

// Remote text goes through the same flattening and control-character strip as
// every other remote string: it lands in the terminal.
const clean = (s: string | undefined): string => htmlToText(s ?? "");

export function mapTopTitles(rows: DiscoverRow[], kind: TitleKind, limit = MAX_TITLES): TopTitle[] {
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
  return out.slice(0, limit);
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

// A year's shows come from two lists. Only the air-date one holds library
// shows that crowd the popular end, so it is read deeper to leave enough with a
// season premiering that year to fill the list.
const DEBUT_PAGES = LIST_PAGES;
const AIRING_PAGES = 8;
const DETAIL_BATCH = 20;

type DiscoverJson = { results?: DiscoverRow[] };

// Pages 1..n of a discover query, asked together. A page failing leaves the
// rest; throwIfAllFailed is for the caller that needs at least one.
function discoverPages(
  kind: TitleKind,
  params: Record<string, string>,
  n: number,
  request: TmdbOptions,
): Promise<PromiseSettledResult<DiscoverJson>[]> {
  return Promise.allSettled(
    Array.from({ length: n }, (_, i) =>
      tmdbGet<DiscoverJson>(`/discover/${kind}`, { ...params, page: String(i + 1) }, request),
    ),
  );
}

function rowsOf(res: PromiseSettledResult<DiscoverJson>[]): DiscoverRow[] {
  return res.flatMap((r) => (r.status === "fulfilled" ? (r.value.results ?? []) : []));
}

function throwIfAllFailed(res: PromiseSettledResult<DiscoverJson>[]): void {
  if (res.length > 0 && res.every((r) => r.status === "rejected")) {
    throw (res[0] as PromiseRejectedResult).reason;
  }
}

function baseParams(provider: number, region: string): Record<string, string> {
  return {
    with_watch_providers: String(provider),
    watch_region: region,
    with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc",
    language: "en-US",
  };
}

// The newest season that premiered in `year`, as "S4", or null if none did.
// Fetched per show and cached on its own, since the same show turns up in many
// platforms' and years' lists.
async function seasonPremiere(id: number, year: number, request: TmdbOptions): Promise<string | null> {
  try {
    const seasons = await cached(`seasons|${id}`, async () => {
      const json = await tmdbGet<DetailsJson>(`/tv/${id}`, { language: "en-US" }, request);
      return (json.seasons ?? [])
        .filter((x) => typeof x.season_number === "number" && x.season_number > 0)
        .map((x) => ({ number: x.season_number!, airDate: x.air_date ?? "" }));
    });
    const hit = seasons.filter((x) => x.airDate.startsWith(String(year))).map((x) => x.number);
    return hit.length > 0 ? `S${Math.max(...hit)}` : null;
  } catch {
    // One show's details failing drops that show, not the list.
    return null;
  }
}

// A show counts for a year when it debuted in it or a season premiered in it.
// Neither TMDB filter alone says that: the debut year misses a returning show
// in every later year, and the air-date range also admits every long-running
// show that merely aired an episode (so a top 20 by popularity is all library
// shows, and a new show with little popularity yet falls off it). So the debut
// list and the air-date list are both fetched, the air-date ones are checked
// for a season that premiered that year, and the lot is ranked by popularity
// and tagged with why it is there. Scripted shows and miniseries only; talk
// shows, game shows and news are not picks.
async function showsForYear(
  provider: number,
  region: string,
  year: number,
  request: TmdbOptions,
): Promise<TopTitle[]> {
  const base = { ...baseParams(provider, region), with_type: "2|4" };
  const [debutRes, airingRes] = await Promise.all([
    discoverPages("tv", { ...base, first_air_date_year: String(year) }, DEBUT_PAGES, request),
    discoverPages(
      "tv",
      { ...base, "air_date.gte": `${year}-01-01`, "air_date.lte": `${year}-12-31` },
      AIRING_PAGES,
      request,
    ),
  ]);
  // Pages failing leaves the others' rows; every page failing is an error.
  throwIfAllFailed([...debutRes, ...airingRes]);

  const debut = mapTopTitles(rowsOf(debutRes), "tv", Infinity).map((t) => ({ ...t, tag: "New" }));
  const known = new Set(debut.map((t) => t.id));
  const airing = mapTopTitles(rowsOf(airingRes), "tv", Infinity).filter((t) => !known.has(t.id));

  const returning: TopTitle[] = [];
  for (let i = 0; i < airing.length; i += DETAIL_BATCH) {
    const batch = airing.slice(i, i + DETAIL_BATCH);
    const tags = await Promise.all(batch.map((t) => seasonPremiere(t.id, year, request)));
    batch.forEach((t, n) => {
      if (tags[n]) returning.push({ ...t, tag: tags[n]! });
    });
  }
  return mergeTop([debut, returning]);
}

// What is most popular on a platform, for shows or for films, among titles
// streaming included with a subscription in the user's region. With a `year`,
// a film is one released that year and a show is one that debuted or had a
// season premiere that year (tagged with which); without a year, whatever is
// popular right now. A hundred of each.
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
    if (kind === "tv" && year !== undefined) return showsForYear(provider, region, year, request);
    const res = await discoverPages(
      kind,
      {
        ...baseParams(provider, region),
        ...(year === undefined ? {} : { primary_release_year: String(year) }),
      },
      LIST_PAGES,
      request,
    );
    throwIfAllFailed(res);
    return mergeTop([mapTopTitles(rowsOf(res), kind, Infinity)]);
  });
}

// Lists merged into one: each title once, the most popular first, up to `limit`.
export function mergeTop(lists: TopTitle[][], limit = MAX_TITLES): TopTitle[] {
  const byId = new Map<number, TopTitle>();
  for (const t of lists.flat()) if (!byId.has(t.id)) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, limit);
}

interface DetailsJson {
  genres?: { name?: string }[];
  tagline?: string;
  runtime?: number;
  status?: string;
  seasons?: { season_number?: number; name?: string; episode_count?: number; air_date?: string | null }[];
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
