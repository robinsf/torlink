import { useEffect, useState } from "react";
import { canDescribe, describeResult, type Description } from "../../describe";
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
