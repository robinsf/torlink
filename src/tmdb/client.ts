import { fetchResilient, HttpError, USER_AGENT, type FetchImpl } from "../util/net";

const API = "https://api.themoviedb.org/3";

// The key comes from the environment only: it is never written to the config
// file or the logs. Either TMDB credential works, the v3 API key or the v4
// read access token.
export function tmdbKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.TORLINK_TMDB_KEY?.trim();
  return key ? key : null;
}

// Which country's catalogue "available on <platform>" is judged against.
export function tmdbRegion(env: NodeJS.ProcessEnv = process.env): string {
  const region = env.TORLINK_TMDB_REGION?.trim().toUpperCase();
  return region && /^[A-Z]{2}$/.test(region) ? region : "US";
}

export interface TmdbOptions {
  signal?: AbortSignal;
  key?: string;
  fetchImpl?: FetchImpl;
}

// A v4 read access token is a JWT and travels as a bearer header; a v3 key is
// a query parameter, which is the only place that API accepts it.
export async function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
  opts: TmdbOptions = {},
): Promise<T> {
  const key = opts.key ?? tmdbKey();
  if (!key) throw new HttpError(401, "TMDB key not set");
  const bearer = key.startsWith("eyJ");
  const qs = new URLSearchParams(params);
  if (!bearer) qs.set("api_key", key);
  const res = await fetchResilient(`${API}${path}?${qs.toString()}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(bearer ? { Authorization: `Bearer ${key}` } : {}),
    },
    signal: opts.signal,
    retries: 1,
    fetchImpl: opts.fetchImpl,
  });
  if (res.status === 401) throw new HttpError(401, "TMDB rejected the key");
  if (!res.ok) throw new HttpError(res.status, `TMDB returned ${res.status}`);
  return (await res.json()) as T;
}
