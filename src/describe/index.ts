import { getSource } from "../sources/registry";
import type { TorrentResult } from "../sources/types";
import { parseRelease, type ReleaseInfo } from "./parse";
import { tvDescription } from "./tvmaze";
import { movieDescription } from "./wikipedia";
import type { Description, DescribeOptions } from "./types";

export type { Description } from "./types";

type Kind = "tv" | "movie";

// TORLINK_NO_DESCRIPTIONS turns the lookups off entirely, so no title ever
// leaves the machine for TVmaze or Wikipedia.
function enabled(): boolean {
  return !process.env.TORLINK_NO_DESCRIPTIONS;
}

// Whether a result is a show or a film, by what the name says and which tabs
// its source feeds. Games and anime never get a lookup, and a name that gives
// no hint on a source feeding both Movies and TV is left alone rather than
// guessed at.
function kindOf(r: TorrentResult, info: ReleaseInfo): Kind | null {
  const groups = getSource(r.source).groups ?? [];
  const movies = groups.includes("Movies");
  const tv = groups.includes("TV");
  if (!movies && !tv) return null;
  if (info.season !== undefined) return tv || !movies ? "tv" : null;
  if (movies && !tv) return "movie";
  if (tv && !movies) return "tv";
  return info.year !== undefined ? "movie" : null;
}

interface Plan {
  kind: Kind;
  info: ReleaseInfo;
}

function plan(r: TorrentResult): Plan | null {
  if (!enabled()) return null;
  const info = parseRelease(r.name);
  if (!info) return null;
  const kind = kindOf(r, info);
  return kind ? { kind, info } : null;
}

// Sync, so the details pane can tell a lookup is coming (show "looking up")
// from one that never will (show nothing) without a flash.
export function canDescribe(r: TorrentResult): boolean {
  return plan(r) !== null;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;
const cache = new Map<string, { at: number; value: Description | null }>();

// Resolves to null when the service has nothing for this title. Rejects on a
// network failure; the caller treats that as nothing to show, and it is not
// cached, so reopening the pane tries again.
export async function describeResult(
  r: TorrentResult,
  opts: DescribeOptions = {},
): Promise<Description | null> {
  const p = plan(r);
  if (!p) return null;
  const { kind, info } = p;
  const key = [kind, info.title.toLowerCase(), info.year, info.season, info.episode].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const value = kind === "tv" ? await tvDescription(info, opts) : await movieDescription(info, opts);
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}
