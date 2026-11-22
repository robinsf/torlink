import { useEffect, useState } from "react";
import { SOURCES } from "../../sources/registry";
import { cachedSearch } from "../../sources/cache";
import { dedupeResults } from "../dedupe";
import { defaultOrder } from "../sort";
import { HttpError } from "../../util/net";
import type { Source, SourceId, TorrentResult } from "../../sources/types";

export interface SourceState {
  loading: boolean;
  error: string | null;
  code: string | null;
  count: number;
}

function errorCode(e: unknown): string {
  if (e instanceof HttpError && e.status > 0) return `HTTP ${e.status}`;
  return "no response";
}

export interface ConcurrentSearchState {
  results: TorrentResult[];
  perSource: Record<SourceId, SourceState>;
  loading: boolean;
  done: number;
  total: number;
}

// Sources outside `active` are never asked, so they are never loading.
function blankPerSource(
  loading: boolean,
  active: readonly Source[] = SOURCES,
): Record<SourceId, SourceState> {
  const out = {} as Record<SourceId, SourceState>;
  for (const s of SOURCES) {
    out[s.id] = { loading: loading && active.includes(s), error: null, code: null, count: 0 };
  }
  return out;
}

function idleState(): ConcurrentSearchState {
  return {
    results: [],
    perSource: blankPerSource(false),
    loading: false,
    done: 0,
    total: SOURCES.length,
  };
}

// Coalesce interval for streaming result updates. Sources finish in bursts (a
// cache hit or a couple of fast hosts land almost together), and each update
// re-sorts and re-renders the whole list. Flushing at most once per this window
// keeps a burst from flooding Ink with re-renders and blocking stdin — the same
// leading-throttle the queue hooks in store.ts use for `update` events.
const RESULT_FLUSH_MS = 150;

// `sources` narrows the search to a subset (a platform tab only asks the video
// sources); it must be a stable array, since a new one restarts the search.
export function useConcurrentSearch(
  query: string,
  sources: readonly Source[] = SOURCES,
): ConcurrentSearchState {
  const [state, setState] = useState<ConcurrentSearchState>(idleState);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    const collected: TorrentResult[] = [];
    const per = blankPerSource(true, sources);
    let done = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = (): void => {
      setState({
        results: defaultOrder(dedupeResults(collected.slice())),
        perSource: { ...per },
        loading: done < sources.length,
        done,
        total: sources.length,
      });
    };

    // Push the accumulated state to the UI, but no more than once per window.
    // The final source flushes immediately so "done" / loading:false is prompt.
    const scheduleFlush = (): void => {
      if (done >= sources.length) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        flush();
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (alive) flush();
      }, RESULT_FLUSH_MS);
    };

    setState({
      results: [],
      perSource: { ...per },
      loading: true,
      done: 0,
      total: sources.length,
    });

    for (const source of sources) {
      cachedSearch(source, query, { signal: ctrl.signal })
        .then((res) => {
          if (!alive) return;
          collected.push(...res);
          per[source.id] = { loading: false, error: null, code: null, count: res.length };
        })
        .catch((e: unknown) => {
          if (!alive || ctrl.signal.aborted) return;
          per[source.id] = {
            loading: false,
            error: e instanceof Error ? e.message : String(e),
            code: errorCode(e),
            count: 0,
          };
        })
        .finally(() => {
          if (!alive) return;
          done += 1;
          scheduleFlush();
        });
    }

    return () => {
      alive = false;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [query, sources]);

  return state;
}
