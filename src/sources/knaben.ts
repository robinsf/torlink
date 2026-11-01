import { fetchResilient, HttpError, USER_AGENT } from "../util/net";
import { buildMagnet } from "./magnet";
import type { SearchOptions, Source, SourceId, TorrentResult } from "./types";

// Knaben is a metasearch over many public trackers behind one JSON API, with
// the seeder counts each tracker reported. torlink asks it for its TV and
// Movies top-level categories only, which feeds those two tabs and leaves
// Games to FitGirl and Anime to its dedicated sources, the same split
// BitTorrented uses. Rows other sources also carry collapse on info hash in the
// results list, so overlap with TPB and YTS costs nothing.
const API = "https://api.knaben.org/v1";

// Knaben's top-level category ids.
const CATEGORY_TV = 2_000_000;
const CATEGORY_MOVIES = 3_000_000;

// A search needs real text: an empty query has nothing to match, so browse
// returns nothing rather than a request that would answer with noise.
const MIN_QUERY = 3;
const PAGE_SIZE = 50;

interface KnabenHit {
  hash?: string | null;
  title?: string;
  bytes?: number;
  seeders?: number | null;
  peers?: number | null;
  date?: string;
}

interface KnabenResponse {
  hits?: KnabenHit[];
}

function toUnixSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

// Map the API rows to torlink results. Pure and exported so the mapping is
// tested without a live request. Rows without a valid 40-char info hash are
// dropped (a magnet needs one). Knaben's `peers` is its leecher count (live
// rows report more seeders than peers), so it maps straight across.
export function mapKnabenResults(hits: KnabenHit[], id: SourceId): TorrentResult[] {
  const out: TorrentResult[] = [];
  for (const h of hits) {
    const infoHash = h.hash?.toLowerCase();
    if (!infoHash || !/^[a-f0-9]{40}$/.test(infoHash)) continue;
    const name = h.title || infoHash;
    out.push({
      infoHash,
      name,
      sizeBytes: h.bytes ?? 0,
      seeders: h.seeders ?? 0,
      leechers: h.peers ?? 0,
      source: id,
      magnet: buildMagnet(infoHash, name),
      added: toUnixSeconds(h.date),
    });
  }
  return out;
}

async function search(query: string, opts: SearchOptions = {}): Promise<TorrentResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];

  const res = await fetchResilient(API, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      search_type: "100%",
      search_field: "title",
      query: q,
      categories: [CATEGORY_TV, CATEGORY_MOVIES],
      order_by: "seeders",
      order_direction: "desc",
      from: 0,
      size: PAGE_SIZE,
      hide_unsafe: true,
    }),
    signal: opts.signal,
    retries: 1,
  });
  if (!res.ok) throw new HttpError(res.status, `Knaben returned ${res.status}`);

  const json = (await res.json()) as KnabenResponse;
  return mapKnabenResults(json.hits ?? [], "knaben");
}

export const knaben: Source = {
  id: "knaben",
  label: "Knaben",
  groups: ["Movies", "TV"],
  homepage: "https://knaben.org",
  reportsHealth: true,
  search,
};
