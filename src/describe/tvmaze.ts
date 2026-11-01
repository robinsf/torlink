import { fetchResilient, HttpError, USER_AGENT } from "../util/net";
import { htmlToText } from "./text";
import type { ReleaseInfo } from "./parse";
import type { Description, DescribeOptions } from "./types";

const API = "https://api.tvmaze.com";

interface TvmazeShow {
  id?: number;
  name?: string;
  premiered?: string | null;
  summary?: string | null;
  genres?: string[];
}

interface TvmazeEpisode {
  name?: string;
  summary?: string | null;
}

// A 404 is TVmaze's "no such show/episode", an answer rather than a failure.
async function getJson<T>(url: string, opts: DescribeOptions): Promise<T | null> {
  const res = await fetchResilient(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: opts.signal,
    retries: 1,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status, `TVmaze returned ${res.status}`);
  return (await res.json()) as T;
}

const code = (season: number, episode: number): string =>
  `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;

// The show's own blurb, or the episode's when the release names one. TVmaze's
// single-search picks the best title match, which is right for the usual
// release name; an episode TVmaze does not know falls back to the show.
export async function tvDescription(
  info: ReleaseInfo,
  opts: DescribeOptions = {},
): Promise<Description | null> {
  const show = await getJson<TvmazeShow>(
    `${API}/singlesearch/shows?q=${encodeURIComponent(info.title)}`,
    opts,
  );
  if (!show?.name) return null;

  if (show.id !== undefined && info.season !== undefined && info.episode !== undefined) {
    const ep = await getJson<TvmazeEpisode>(
      `${API}/shows/${show.id}/episodebynumber?season=${info.season}&number=${info.episode}`,
      opts,
    );
    const text = ep?.summary ? htmlToText(ep.summary) : "";
    if (ep && text) {
      const title = ep.name ? ` · ${htmlToText(ep.name)}` : "";
      return {
        heading: `${htmlToText(show.name)} · ${code(info.season, info.episode)}${title}`,
        text,
        via: "TVmaze",
      };
    }
  }

  const text = show.summary ? htmlToText(show.summary) : "";
  if (!text) return null;
  const year = show.premiered?.slice(0, 4);
  const season = info.season !== undefined ? ` · Season ${info.season}` : "";
  const genres = show.genres?.length ? ` · ${show.genres.map(htmlToText).join(", ")}` : "";
  return {
    heading: `${htmlToText(show.name)}${year ? ` (${year})` : ""}${season}${genres}`,
    text,
    via: "TVmaze",
  };
}
