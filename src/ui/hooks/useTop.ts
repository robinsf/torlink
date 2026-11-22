import { useEffect, useState } from "react";
import { tmdbKey } from "../../tmdb/client";
import { fetchPoster, postersEnabled, type Pixels } from "../../tmdb/poster";
import {
  seasonEpisodes,
  titleDetails,
  topTitles,
  type Episode,
  type TitleDetails,
  type TitleKind,
  type TopTitle,
} from "../../tmdb/top";
import { HttpError } from "../../util/net";

export interface Loaded<T> {
  loading: boolean;
  // Why there is nothing to show: "nokey", or a short sentence.
  error: string | null;
  value: T | null;
}

function describeError(e: unknown): string {
  if (e instanceof HttpError && e.status === 401) return "TMDB rejected the key. Check TORLINK_TMDB_KEY.";
  if (e instanceof HttpError && e.status > 0) return `TMDB answered ${e.status}.`;
  return "Couldn't reach TMDB.";
}

// Runs `load` whenever `deps` change, drops the answer if they change again
// first, and reads a failure as an error line rather than a crash.
function useLoad<T>(enabled: boolean, load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ loading: false, error: null, value: null });
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, value: null });
      return;
    }
    if (!tmdbKey()) {
      setState({ loading: false, error: "nokey", value: null });
      return;
    }
    const ctl = new AbortController();
    setState({ loading: true, error: null, value: null });
    load(ctl.signal).then(
      (value) => {
        if (!ctl.signal.aborted) setState({ loading: false, error: null, value });
      },
      (e: unknown) => {
        if (!ctl.signal.aborted) setState({ loading: false, error: describeError(e), value: null });
      },
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return state;
}

export function useTopTitles(platformId: string, kind: TitleKind): Loaded<TopTitle[]> {
  return useLoad(true, (signal) => topTitles(platformId, kind, { signal }), [platformId, kind]);
}

export function useTitleDetails(title: TopTitle | null): Loaded<TitleDetails> {
  return useLoad(!!title, (signal) => titleDetails(title!.kind, title!.id, { signal }), [
    title?.kind,
    title?.id,
  ]);
}

export function useEpisodes(title: TopTitle | null, season: number | null): Loaded<Episode[]> {
  const on = !!title && title.kind === "tv" && season !== null;
  return useLoad(on, (signal) => seasonEpisodes(title!.id, season!, { signal }), [title?.id, season]);
}

// The poster's pixels: null while it loads, "none" when there is no poster to
// show (no path, posters off, or the fetch or decode failed), since a missing
// poster is never an error.
export function usePoster(path: string | undefined): Pixels | "none" | null {
  const [pixels, setPixels] = useState<Pixels | "none" | null>(path && postersEnabled() ? null : "none");
  useEffect(() => {
    if (!path || !postersEnabled()) {
      setPixels("none");
      return;
    }
    setPixels(null);
    const ctl = new AbortController();
    fetchPoster(path, { signal: ctl.signal }).then(
      (img) => {
        if (!ctl.signal.aborted) setPixels(img ?? "none");
      },
      () => {
        if (!ctl.signal.aborted) setPixels("none");
      },
    );
    return () => ctl.abort();
  }, [path]);
  return pixels;
}
