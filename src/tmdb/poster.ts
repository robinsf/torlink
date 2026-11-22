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
  const hit = cache.get(path);
  if (hit) return hit;

  const res = await fetchResilient(`${IMAGE_BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "image/jpeg" },
    signal: opts.signal,
    retries: 1,
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

  cache.delete(path);
  cache.set(path, pixels);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return pixels;
}
