import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Text, useInput } from "ink";
import { useStore, CATEGORIES } from "../store";
import { Spinner } from "./Spinner";
import { SearchBar } from "./SearchBar";
import { TextField } from "./TextField";
import { Panel } from "./Panel";
import { Rule } from "./Rule";
import { useConcurrentSearch } from "../hooks/useConcurrentSearch";
import { useDescription, useResultPoster } from "../hooks/useDescription";
import { Poster, POSTER_GAP, posterBox } from "./Poster";
import { canPoster } from "../../describe";
import { postersEnabled } from "../../tmdb/poster";
import { getSource, SOURCES } from "../../sources/registry";
import { stickCursor, wrapStep, windowStart, resultsPanelOuter } from "../move";
import { sortResults, nextSort, sortLabel, sortArrow, type Sort, type SortField } from "../sort";
import { filterResults } from "../filter";
import { detectPlatform, PLATFORMS, platformQuery } from "../platform";
import { COLOR, GUTTER, ICON, sourceStyle } from "../theme";
import { cleanText, clipWords, formatBytes, formatCount, formatRelative, stripControl, truncate } from "../../util/format";
import type { Source, TorrentResult } from "../../sources/types";

type Mode = "list" | "search" | "detail" | "filter";

// Own column for the batch-select tick, so it never shifts when the pointer
// shares the row; the second cell is the gap before the row number.
const MARK_W = 2;

const PLACEHOLDER = "Search or paste a magnet link…";

// A platform tab only asks the sources that carry video; games and anime
// sources would just answer a platform tag with noise.
const VIDEO_SOURCES: readonly Source[] = SOURCES.filter(
  (s) => s.groups?.includes("Movies") || s.groups?.includes("TV"),
);

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Box width={9} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      <Box flexGrow={1} minWidth={0}>{value}</Box>
    </Box>
  );
}

// Rows the About block may take (a heading, the blurb, a "via" credit), out of
// what the panel has left once the fixed detail rows are placed.
const DETAIL_FIXED_ROWS = 17;
const ABOUT_MAX_ROWS = 5;
const ABOUT_CHROME_ROWS = 2;

function Detail({ r, width, aboutRows, rows }: { r: TorrentResult; width: number; aboutRows: number; rows: number }) {
  const ss = sourceStyle(r.source);
  const via = detectPlatform(r.name);
  const about = useDescription(r);
  // A poster sits to the left when the result is one that has one and the pane
  // has the room; it gives way to the text otherwise, or when none is found.
  const box = posterBox(rows, width);
  const wantPoster = box !== null && postersEnabled() && canPoster(r);
  const poster = useResultPoster(wantPoster ? r : null, about);
  const showPoster = wantPoster && poster !== "none";
  const bodyW = showPoster ? width - box!.cols - POSTER_GAP : width;
  const aboutWidth = Math.max(10, bodyW - 10);
  const date = formatRelative(r.added);
  const health =
    r.seeders || r.leechers ? (
      <Text>
        <Text color={r.seeders > 0 ? COLOR.good : undefined} bold={r.seeders > 0}>
          {r.seeders}
        </Text>
        <Text dimColor>{` seeders ${ICON.dot} ${r.leechers} leechers`}</Text>
      </Text>
    ) : (
      <Text dimColor>unknown</Text>
    );
  return (
    <Box>
      {showPoster ? (
        <Box marginRight={POSTER_GAP} flexShrink={0}>
          <Poster img={poster} cols={box!.cols} rows={box!.rows} />
        </Box>
      ) : null}
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        <Box>
          <Box flexGrow={1} minWidth={0}>
            <Text bold color={COLOR.text} wrap="truncate-end">
              {cleanText(r.name)}
            </Text>
          </Box>
          <Box flexShrink={0} marginLeft={2}>
            <Text color={ss.color} bold>
              {ss.tag}
            </Text>
          </Box>
        </Box>
        <Rule width={bodyW} />
        <Box marginTop={1} flexDirection="column">
          <DetailRow
            label="Size"
            value={
              r.sizeBytes > 0 ? (
                <Text color={COLOR.text}>{formatBytes(r.sizeBytes)}</Text>
              ) : (
                <Text dimColor>unknown</Text>
              )
            }
          />
          <DetailRow label="Health" value={health} />
          {r.numFiles ? (
            <DetailRow label="Files" value={<Text dimColor>{String(r.numFiles)}</Text>} />
          ) : null}
          {date ? <DetailRow label="Added" value={<Text dimColor>{date}</Text>} /> : null}
          {via ? <DetailRow label="Platform" value={<Text color={COLOR.text}>{via.label}</Text>} /> : null}
          {aboutRows >= 1 && about.loading ? (
            <DetailRow label="About" value={<Text dimColor>looking up…</Text>} />
          ) : null}
          {aboutRows > ABOUT_CHROME_ROWS && about.description ? (
            <DetailRow
              label="About"
              value={
                <Box flexDirection="column">
                  <Text color={COLOR.text} bold wrap="truncate-end">
                    {about.description.heading}
                  </Text>
                  <Text dimColor>
                    {clipWords(about.description.text, (aboutRows - ABOUT_CHROME_ROWS) * (aboutWidth - 1))}
                  </Text>
                  <Text color={COLOR.alt} dimColor>{`via ${about.description.via}`}</Text>
                </Box>
              }
            />
          ) : null}
          <DetailRow
            label="Hash"
            value={
              <Text color={COLOR.alt} dimColor wrap="truncate-end">
                {stripControl(r.infoHash)}
              </Text>
            }
          />
          <DetailRow
            label="Magnet"
            value={
              <Text color={COLOR.alt} dimColor wrap="truncate-end">
                {stripControl(r.magnet)}
              </Text>
            }
          />
        </Box>
        <Box marginTop={1}>
          <Text color={COLOR.accent} bold>
            d
          </Text>
          <Text color={COLOR.text}> Download</Text>
          <Text dimColor>{`  ${ICON.dot}  `}</Text>
          <Text color={COLOR.accent} bold>
            y
          </Text>
          <Text color={COLOR.text}> Copy</Text>
          <Text dimColor>{`  ${ICON.dot}  `}</Text>
          <Text color={COLOR.accent} bold>
            e
          </Text>
          <Text color={COLOR.text}> Export</Text>
          <Text dimColor>{`  ${ICON.dot}  `}</Text>
          <Text color={COLOR.alt}>esc</Text>
          <Text dimColor> back</Text>
        </Box>
      </Box>
    </Box>
  );
}

export function Results() {
  const {
    query,
    submitQuery,
    section,
    region,
    setRegion,
    setCaptureMode,
    startDownload,
    requestDownloadTo,
    copyMagnet,
    fetchAndExportTorrent,
    setResultFocus,
    contentWidth,
    listRows,
  } = useStore();

  const activeCat = CATEGORIES.find((c) => c.key === section);
  const activePlatform = activeCat?.platform
    ? PLATFORMS.find((p) => p.id === activeCat.platform) ?? null
    : null;
  // A platform tab searches for that platform's tag (narrowed by the query);
  // any other tab searches for the query as typed.
  const search = useConcurrentSearch(
    activePlatform ? platformQuery(activePlatform, query) : query,
    activePlatform ? VIDEO_SOURCES : undefined,
  );

  // What a tab shows out of everything the search found: its source group, or
  // the releases that name its platform.
  const inTab = (list: TorrentResult[]): TorrentResult[] =>
    activePlatform
      ? list.filter((r) => detectPlatform(r.name)?.id === activePlatform.id)
      : activeCat?.group
        ? list.filter((r) => getSource(r.source).groups?.includes(activeCat.group!))
        : list;

  const [sort, setSort] = useState<Sort>("none");
  const [hideDead, setHideDead] = useState(false);
  const [textFilter, setTextFilter] = useState("");
  const results = useMemo(
    () => sortResults(filterResults(inTab(search.results), hideDead, textFilter), sort),
    // inTab reads activeCat/activePlatform, which follow section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search.results, section, sort, hideDead, textFilter],
  );

  const focused = region === "content";
  const [mode, setMode] = useState<Mode>("list");
  const [cursor, setCursor] = useState(0);
  // The row the user navigated to, by infohash; null until they move. Keeps
  // the cursor on their row while streamed-in sources reshuffle the list.
  const selRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<TorrentResult | null>(null);
  // Rows marked with space for a batch download, by infohash so the marks
  // survive re-sorting and streamed-in results.
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setCursor((c) => stickCursor(results, selRef.current, c));
  }, [results]);

  useEffect(() => {
    selRef.current = null;
    setCursor(0);
    setTextFilter("");
    setMarked(new Set());
  }, [query, section]);

  useEffect(() => {
    if (!focused) return;
    setCaptureMode(mode === "search" || mode === "filter" ? "text" : mode === "detail" ? "esc" : "none");
    return () => setCaptureMode("none");
  }, [mode, focused, setCaptureMode]);

  useEffect(() => {
    if (!focused) setMode("list");
  }, [focused]);

  useEffect(() => {
    if (!focused) return;
    setResultFocus(mode === "detail" ? "detail" : "list");
    return () => setResultFocus(null);
  }, [mode, focused, setResultFocus]);

  const clamped = Math.min(cursor, Math.max(0, results.length - 1));

  const searchH = 3;
  const filterH = mode === "filter" || textFilter.trim() ? 1 : 0;
  const panelOuter = resultsPanelOuter(listRows, searchH + filterH);
  const listHeight = Math.max(3, panelOuter - 4);
  const pageJump = Math.max(1, listHeight - 1);

  const openDownload = (r: TorrentResult): void =>
    startDownload({
      id: r.infoHash,
      name: r.name,
      magnet: r.magnet,
      source: r.source,
      sizeBytes: r.sizeBytes,
    });

  const openDownloadTo = (rs: TorrentResult[], onQueued?: () => void): void =>
    requestDownloadTo(
      rs.map((r) => ({
        id: r.infoHash,
        name: r.name,
        magnet: r.magnet,
        source: r.source,
        sizeBytes: r.sizeBytes,
      })),
      onQueued,
    );

  const copyResultMagnet = (r: TorrentResult): void =>
    copyMagnet({ name: r.name, magnet: r.magnet });

  const toggleMark = (id: string): void =>
    setMarked((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const moveTo = (n: number): void => {
    setCursor(n);
    selRef.current = results[n]?.infoHash ?? null;
  };

  useInput(
    (input, key) => {
      if (input === "/") {
        setMode("search");
        return;
      }
      if (key.upArrow || input === "k") {
        if (results.length > 0 && clamped > 0) moveTo(clamped - 1);
        else setMode("search");
        return;
      }
      if (input === "s") {
        setSort((cur) => nextSort(cur));
      } else if (input === "z") {
        setHideDead((on) => !on);

      } else if (input === "f") {
        setMode("filter");
      } else if (results.length === 0) {
        return;
      } else if (key.downArrow || input === "j") {
        moveTo(wrapStep(clamped, 1, results.length));
      } else if (key.pageUp) {
        moveTo(Math.max(0, clamped - pageJump));
      } else if (key.pageDown) {
        moveTo(Math.min(results.length - 1, clamped + pageJump));
      } else if (key.return) {
        const r = results[clamped];
        if (r) {
          setDetail(r);
          setMode("detail");
        }
      } else if (input === " ") {
        const r = results[clamped];
        if (r) toggleMark(r.infoHash);
      } else if (input === "d" || input === "D") {
        // Only marks still in view count: a filter can hide a marked row, and
        // downloading something the user can't see would be a surprise.
        const batch = results.filter((r) => marked.has(r.infoHash));
        const r = results[clamped];
        const targets = batch.length > 0 ? batch : r ? [r] : [];
        if (targets.length === 0) return;
        const clearMarks = (): void => setMarked(new Set());
        if (input === "d") {
          targets.forEach(openDownload);
          clearMarks();
        } else {
          // Keep the selection while the folder prompt is open: cancelling it
          // should not cost the user their marks.
          openDownloadTo(targets, clearMarks);
        }
      } else if (input === "y") {
        const r = results[clamped];
        if (r) copyResultMagnet(r);
      }
    },
    { isActive: focused && mode === "list" },
  );

  useInput(
    (input, key) => {
      if (key.escape) {
        setMode("list");
        setDetail(null);
      } else if (input === "d" && detail) openDownload(detail);
      else if (input === "D" && detail) openDownloadTo([detail]);
      else if (input === "y" && detail) copyResultMagnet(detail);
      else if (input === "e" && detail)
        fetchAndExportTorrent({ id: detail.infoHash, name: detail.name, magnet: detail.magnet });
    },
    { isActive: focused && mode === "detail" },
  );

  useInput(
    (_input, key) => {
      if (key.escape) setMode("list");
    },
    { isActive: focused && (mode === "search" || mode === "filter") },
  );

  const onSubmit = (value: string): void => {
    setMode("list");
    submitQuery(value);
  };

  const browsing = query.trim() === "";
  const erroredCount = useMemo(
    () => Object.values(search.perSource).filter((s) => s.error).length,
    [search.perSource],
  );
  const tabSources = activePlatform
    ? VIDEO_SOURCES
    : activeCat?.group
      ? SOURCES.filter((s) => s.groups?.includes(activeCat.group!))
      : SOURCES;
  const tabErrored =
    tabSources.length > 0 && tabSources.every((s) => search.perSource[s.id]?.error);
  // Only the active tab's sources hold its spinner; other groups' stragglers
  // stream in silently.
  const pending = tabSources.some((s) => search.perSource[s.id]?.loading);
  const showStats = useMemo(
    () => results.some((r) => r.sizeBytes > 0 || r.seeders > 0),
    [results],
  );
  const numW = Math.max(2, String(results.length).length);

  const outageCodes = (sources: readonly Source[]): string => {
    const codes = [
      ...new Set(sources.map((s) => search.perSource[s.id]?.code).filter(Boolean)),
    ];
    return codes.length ? ` (${codes.join(", ")})` : "";
  };

  const sortNote = sort === "none" ? "" : `  ${ICON.dot} sort: ${sortLabel(sort)}`;
  const filterNote = hideDead ? `  ${ICON.dot} alive only` : "";
  const head = browsing
    ? activePlatform
      ? `latest on ${activePlatform.label}`
      : "newest across all sources"
    : `${results.length} result${results.length === 1 ? "" : "s"}`;

  const status = () => {
    if (pending) {
      // Rows are already usable: the settled header simply carries a spinner
      // until the tab's last source lands.
      if (results.length > 0)
        return (
          <Text>
            <Text dimColor>{`${head}${sortNote}${filterNote}  `}</Text>
            <Spinner />
          </Text>
        );
      return <Spinner label={browsing ? "Loading…" : "Searching…"} />;
    }
    if (results.length === 0) {
      if (erroredCount >= search.total) {
        const downAll = SOURCES.filter((s) => search.perSource[s.id]?.error);
        return (
          <Text color={COLOR.warn}>
            {`Couldn't reach any source. They may be down${outageCodes(downAll)}.`}
          </Text>
        );
      }
      if (tabErrored && activeCat) {
        const down = tabSources.filter((s) => search.perSource[s.id]?.error);
        const who = down.length === 1 ? "The source" : `All ${down.length} sources`;
        return (
          <Text color={COLOR.warn}>
            {`Couldn't reach ${activeCat.label}. ${who} may be down${outageCodes(down)}.`}
          </Text>
        );
      }
      if (hideDead) {
        const base = inTab(search.results);
        if (base.length > 0 && base.every((r) => r.seeders <= 0)) {
          return (
            <Text dimColor>
              All results have zero seeders. Press z to show them.
            </Text>
          );
        }
      }
      if (activePlatform)
        return (
          <Text dimColor>
            {browsing
              ? `Nothing on ${activePlatform.label} right now. Try a search.`
              : `No ${activePlatform.label} releases for "${truncate(query, 28)}".`}
          </Text>
        );
      if (search.results.length > 0 && activeCat?.group)
        return <Text dimColor>{`No ${activeCat.label.toLowerCase()} results yet. Try another tab or a search.`}</Text>;
      return (
        <Text dimColor>
          {browsing ? "Nothing new right now." : `No results for "${truncate(query, 28)}".`}
        </Text>
      );
    }
    const note = erroredCount > 0 ? `  (${erroredCount} source${erroredCount === 1 ? "" : "s"} down)` : "";
    return <Text dimColor>{`${head}${note}${sortNote}${filterNote}`}</Text>;
  };

  const sortMark = (field: SortField, label: string): ReactNode => {
    if (sort === "none" || sort.field !== field) return label;
    return (
      <>
        <Text color={COLOR.accent} bold>{sortArrow(sort.dir)}</Text>
        {label}
      </>
    );
  };

  const start = windowStart(clamped, results.length, listHeight);
  const visible = results.slice(start, start + listHeight);
  const count = results.length > 0 ? `(${results.length})` : undefined;

  return (
    <Box flexDirection="column">
      <SearchBar
        width={contentWidth}
        value={query}
        editing={mode === "search"}
        placeholder={PLACEHOLDER}
        onSubmit={onSubmit}
        onExitDown={() => setMode("list")}
        onExitLeft={() => setRegion("sidebar")}
      />
      <Box marginTop={1}>
        <Panel
          title={mode === "detail" ? "details" : browsing ? "latest" : "results"}
          width={contentWidth}
          focused={focused && mode !== "search"}
          count={mode === "detail" ? undefined : count}
          height={panelOuter}
        >
          {mode === "detail" && detail ? (
            <Detail
              r={detail}
              width={Math.max(10, contentWidth - 4)}
              aboutRows={Math.min(ABOUT_MAX_ROWS, Math.max(0, panelOuter - DETAIL_FIXED_ROWS))}
              rows={Math.max(1, panelOuter - 2)}
            />
          ) : (
            <>
              <Box>{status()}</Box>
              <Box flexDirection="column" marginTop={results.length > 0 ? 1 : 0}>
                {results.length > 0 ? (
                  <Box>
                    <Box width={GUTTER} flexShrink={0} />
                    <Box width={MARK_W} flexShrink={0} />
                    <Box width={numW} flexShrink={0} justifyContent="flex-end">
                      <Text bold dimColor>#</Text>
                    </Box>
                    <Box flexGrow={1} minWidth={0} marginLeft={1}>
                      <Text bold dimColor>Name</Text>
                    </Box>
                    {showStats ? (
                      <>
                        <Box width={10} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                          <Text bold dimColor>{sortMark("size", "Size")}</Text>
                        </Box>
                        <Box width={9} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                          <Text bold dimColor>{sortMark("seeders", "Seed:Lch")}</Text>
                        </Box>
                      </>
                    ) : (
                      <Box width={12} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                        <Text bold dimColor>Added</Text>
                      </Box>
                    )}
                    <Box width={4} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                      <Text bold dimColor>{sortMark("source", "Src")}</Text>
                    </Box>
                  </Box>
                ) : null}
                {visible.map((r, i) => {
                  const index = start + i;
                  const here = index === clamped && focused && mode === "list";
                  const ss = sourceStyle(r.source);
                  return (
                    <Box key={r.infoHash}>
                      <Box width={GUTTER} flexShrink={0}>
                        <Text color={COLOR.accent}>{here ? ICON.pointer : ""}</Text>
                      </Box>
                      <Box width={MARK_W} flexShrink={0}>
                        <Text color={COLOR.good}>{marked.has(r.infoHash) ? ICON.done : ""}</Text>
                      </Box>
                      <Box width={numW} flexShrink={0} justifyContent="flex-end">
                        <Text dimColor>{index + 1}</Text>
                      </Box>
                      <Box flexGrow={1} minWidth={0} marginLeft={1}>
                        <Text
                          wrap="truncate-end"
                          color={here ? COLOR.accent : undefined}
                          dimColor={!here}
                          bold={here}
                        >
                          {cleanText(r.name)}
                        </Text>
                      </Box>
                      {showStats ? (
                        <>
                          <Box width={10} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                            <Text
                              dimColor={!here}
                              bold={here}
                            >{r.sizeBytes > 0 ? formatBytes(r.sizeBytes) : "-"}
                            </Text>
                          </Box>
                          <Box width={9} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                            <Text
                              color={r.seeders > 0 ? COLOR.good : undefined}
                              dimColor={!here}
                              bold={here}
                            >{r.seeders || r.leechers
                                ? `${formatCount(r.seeders)}:${formatCount(r.leechers)}`
                                : "-"}
                            </Text>
                          </Box>
                        </>
                      ) : (
                        <Box width={12} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                          <Text
                            dimColor={!here}
                            bold={here}
                          >{formatRelative(r.added) || "-"}
                          </Text>
                        </Box>
                      )}
                      <Box width={4} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                        <Text
                          color={ss.color}
                          dimColor={!here}
                          bold={here}
                        >{ss.tag}
                        </Text>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </>
          )}
        </Panel>
      </Box>
      {(mode === "filter" || textFilter.trim()) && (
        <Box width={contentWidth} paddingLeft={1}>
          <Box flexShrink={0}>
            <Text color={COLOR.accent}>{`Filter ${ICON.pointer} `}</Text>
          </Box>
          <Box flexGrow={1} minWidth={0}>
            {mode === "filter" ? (
              <TextField
                defaultValue={textFilter}
                width={Math.max(1, contentWidth - 10)}
                onChange={setTextFilter}
                // Commit from the submit value / functional form, not the
                // render closure: a same-tick burst (ctrl+u then enter) would
                // otherwise resurrect the pre-clear text.
                onSubmit={(value) => { setTextFilter(value.trim()); setMode("list"); }}
                onExitDown={() => { setTextFilter((cur) => cur.trim()); setMode("list"); }}
                onExitLeft={() => { setTextFilter((cur) => cur.trim()); setMode("list"); }}
              />
            ) : (
              <Text wrap="truncate-end">{textFilter}</Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
