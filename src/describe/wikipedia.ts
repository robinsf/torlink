import { fetchResilient, HttpError, USER_AGENT } from "../util/net";
import { htmlToText } from "./text";
import type { ReleaseInfo } from "./parse";
import type { Description, DescribeOptions } from "./types";

const SEARCH = "https://en.wikipedia.org/w/rest.php/v1/search/title";
const SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary";

interface WikiPage {
  key?: string;
  title?: string;
  description?: string | null;
}

interface WikiSummary {
  title?: string;
  description?: string | null;
  extract?: string;
}

async function getJson<T>(url: string, opts: DescribeOptions): Promise<T | null> {
  const res = await fetchResilient(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: opts.signal,
    retries: 1,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status, `Wikipedia returned ${res.status}`);
  return (await res.json()) as T;
}

const bare = (s: string): string => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");

// A film's article, found by title search. Only an article whose title is the
// release's title (parenthetical qualifier aside) and whose short description
// says it is a film counts, so "Dune" cannot land on the novel or a band;
// when the release names a year, the article for that year wins.
export async function movieDescription(
  info: ReleaseInfo,
  opts: DescribeOptions = {},
): Promise<Description | null> {
  const query = `${info.title}${info.year ? ` ${info.year}` : ""} film`;
  const found = await getJson<{ pages?: WikiPage[] }>(
    `${SEARCH}?q=${encodeURIComponent(query)}&limit=5`,
    opts,
  );
  const films = (found?.pages ?? []).filter(
    (p) =>
      p.key &&
      p.title &&
      /film/i.test(p.description ?? "") &&
      bare(p.title) === bare(info.title),
  );
  const year = info.year ? String(info.year) : null;
  const page =
    (year && films.find((p) => `${p.key} ${p.description ?? ""}`.includes(year))) || films[0];
  if (!page?.key) return null;

  const summary = await getJson<WikiSummary>(`${SUMMARY}/${encodeURIComponent(page.key)}`, opts);
  const text = summary?.extract ? htmlToText(summary.extract) : "";
  if (!text) return null;
  const title = htmlToText((summary?.title ?? page.title ?? "").replace(/\s*\([^)]*\)$/, ""));
  const about = summary?.description ? ` · ${htmlToText(summary.description)}` : "";
  return { heading: `${title}${about}`, text, via: "Wikipedia" };
}
