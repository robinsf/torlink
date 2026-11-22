import jpeg from "jpeg-js";
import { fetchResilient, HttpError, USER_AGENT, type FetchImpl } from "../util/net";

// 342 px wide is several times the resolution a poster is drawn at, so the
// averaging in renderPoster has detail to work from even on a tall pane.
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

// A poster is the one thing here fetched without the API key, from TMDB's
// image host. TORLINK_NO_POSTERS turns it off.
export function postersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.TORLINK_NO_POSTERS;
}

export interface Pixels {
  width: number;
  height: number;
  // RGBA, four bytes a pixel.
  data: Uint8Array;
}

// TMDB poster paths look like "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg". Anything else
// is refused, so a path can never steer the request off the image host.
const POSTER_PATH = /^\/[A-Za-z0-9_-]{1,64}\.jpg$/;

// The only hosts a poster is ever fetched from: TMDB's image host, and the two
// keyless services whose answers carry a poster URL (TVmaze for shows,
// Wikipedia for films). A URL a service hands back is checked against this
// before any request, so a poisoned answer cannot point torlink at another
// server.
const POSTER_HOSTS = new Set(["image.tmdb.org", "static.tvmaze.com", "upload.wikimedia.org"]);

export function isPosterUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    POSTER_HOSTS.has(u.hostname) &&
    u.port === "" &&
    !u.username &&
    !u.password &&
    u.search === "" &&
    u.hash === "" &&
    /^\/[A-Za-z0-9_\-./%(),'~]{1,300}\.jpe?g$/i.test(u.pathname) &&
    !u.pathname.includes("..")
  );
}

// Where a poster is: a TMDB poster path, or a full URL from TVmaze or
// Wikipedia.
export type PosterSource = { tmdb: string } | { url: string };

const MAX_BYTES = 512 * 1024;
const MAX_ENTRIES = 20;
const cache = new Map<string, Pixels>();

export interface PosterOptions {
  signal?: AbortSignal;
  fetchImpl?: FetchImpl;
}

// Resolves to null for a path that is not a TMDB poster path or an image that
// will not decode; a network failure rejects, and is not cached.
export async function fetchPoster(path: string, opts: PosterOptions = {}): Promise<Pixels | null> {
  if (!POSTER_PATH.test(path)) return null;
  return fetchImage(`${IMAGE_BASE}${path}`, opts);
}

export function fetchPosterFrom(source: PosterSource, opts: PosterOptions = {}): Promise<Pixels | null> {
  if ("tmdb" in source) return fetchPoster(source.tmdb, opts);
  return isPosterUrl(source.url) ? fetchImage(source.url, opts) : Promise.resolve(null);
}

async function fetchImage(url: string, opts: PosterOptions): Promise<Pixels | null> {
  const hit = cache.get(url);
  if (hit) return hit;

  const res = await fetchResilient(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "image/jpeg" },
    signal: opts.signal,
    retries: 1,
    // A poster host answering with a redirect is not one we vetted.
    redirect: "error",
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) throw new HttpError(res.status, `TMDB images returned ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;

  let pixels: Pixels;
  try {
    const img = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 2,
      maxMemoryUsageInMB: 64,
    });
    pixels = { width: img.width, height: img.height, data: img.data };
  } catch {
    return null;
  }

  cache.delete(url);
  cache.set(url, pixels);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return pixels;
}
