import { useEffect, useState } from "react";
import { canDescribe, canPoster, describeResult, findPoster, type Description } from "../../describe";
import { fetchPosterFrom, postersEnabled, type Pixels } from "../../tmdb/poster";
import type { TorrentResult } from "../../sources/types";

export interface DescriptionState {
  loading: boolean;
  description: Description | null;
}

// The show or film blurb for the result in the details pane. Looks up only
// while a result is open, drops the answer if the pane moves on first, and
// reads a failed lookup as nothing to show.
export function useDescription(r: TorrentResult | null): DescriptionState {
  const [state, setState] = useState<DescriptionState>({ loading: false, description: null });
  const hash = r?.infoHash;

  useEffect(() => {
    if (!r || !canDescribe(r)) {
      setState({ loading: false, description: null });
      return;
    }
    const ctl = new AbortController();
    setState({ loading: true, description: null });
    describeResult(r, { signal: ctl.signal }).then(
      (description) => {
        if (!ctl.signal.aborted) setState({ loading: false, description });
      },
      () => {
        if (!ctl.signal.aborted) setState({ loading: false, description: null });
      },
    );
    return () => ctl.abort();
    // r is read once per open result; its hash identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  return state;
}

// The poster for the result in the details pane: null while it loads, "none"
// when there is no poster to show (no lookup for this kind of result, posters
// off, nothing found, or a failure; a missing poster is never an error). It
// waits for the description, whose service may supply the poster when TMDB has
// none.
export function useResultPoster(r: TorrentResult | null, about: DescriptionState): Pixels | "none" | null {
  const eligible = !!r && postersEnabled() && canPoster(r);
  const [pixels, setPixels] = useState<Pixels | "none" | null>(eligible ? null : "none");
  const hash = r?.infoHash;
  const fallback = about.description?.poster;

  useEffect(() => {
    if (!r || !eligible) {
      setPixels("none");
      return;
    }
    setPixels(null);
    if (about.loading) return;
    const ctl = new AbortController();
    void (async () => {
      try {
        const source = await findPoster(r, fallback, { signal: ctl.signal });
        const img = source ? await fetchPosterFrom(source, { signal: ctl.signal }) : null;
        if (!ctl.signal.aborted) setPixels(img ?? "none");
      } catch {
        if (!ctl.signal.aborted) setPixels("none");
      }
    })();
    return () => ctl.abort();
    // r is read once per open result; its hash identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, eligible, about.loading, fallback]);

  return pixels;
}
