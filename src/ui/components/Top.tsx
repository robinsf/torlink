import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useStore } from "../store";
import { Panel } from "./Panel";
import { Rule } from "./Rule";
import { Spinner } from "./Spinner";
import { useEpisodes, usePoster, useTitleDetails, useTopTitles } from "../hooks/useTop";
import { wrapStep, windowStart } from "../move";
import { COLOR, GUTTER, ICON } from "../theme";
import { PLATFORM_TABS } from "../platform";
import { posterCols, renderPoster, toRuns } from "../poster";
import { postersEnabled } from "../../tmdb/poster";
import { clipWords, truncate } from "../../util/format";
import type { Pixels } from "../../tmdb/poster";
import { recentYears, type TitleKind, type TopTitle } from "../../tmdb/top";

const RATING_W = 6;
const TAG_W = 4;

// A poster needs this much height and leaves the text this much width.
const POSTER_MIN_ROWS = 8;
const POSTER_MAX_ROWS = 24;
const POSTER_GAP = 2;
const TEXT_MIN_W = 36;

// The poster as half-block cells; an empty box of the same size while the
// image is still loading, so the text does not jump when it lands.
function Poster({ img, cols, rows }: { img: Pixels | null; cols: number; rows: number }) {
  const cells = useMemo(() => (img ? renderPoster(img, cols, rows) : null), [img, cols, rows]);
  if (!cells) return <Box width={cols} height={rows} flexShrink={0} />;
  return (
    <Box flexDirection="column" width={cols} flexShrink={0}>
      {cells.map((row, y) => (
        <Text key={y}>
          {toRuns(row).map((run, i) => (
            <Text key={i} color={run.top} backgroundColor={run.bottom}>
              {"▀".repeat(run.length)}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}

function Setup({ error }: { error: string }) {
  if (error !== "nokey") return <Text color={COLOR.warn}>{error}</Text>;
  return (
    <Box flexDirection="column">
      <Text color={COLOR.text}>Top picks needs a free TMDB key.</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>1. Make an account at themoviedb.org, then open Settings → API.</Text>
        <Text dimColor>2. Copy your API key (or the read access token).</Text>
        <Text dimColor>3. Put it in your shell profile and restart torlink:</Text>
        <Text color={COLOR.alt}>{"   export TORLINK_TMDB_KEY=your-key-here"}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>The key stays in your environment; torlink never saves it.</Text>
      </Box>
    </Box>
  );
}

function Detail({ title, platformLabel, width, rows }: { title: TopTitle; platformLabel: string; width: number; rows: number }) {
  const details = useTitleDetails(title);
  const seasons = details.value?.seasons ?? [];
  // Open on the newest season: that is what a top show is being watched for.
  const [season, setSeason] = useState<number | null>(null);
  const shown = season ?? seasons.at(-1)?.number ?? null;
  const episodes = useEpisodes(title, shown);

  useInput((input) => {
    if (seasons.length === 0) return;
    const at = Math.max(0, seasons.findIndex((s) => s.number === shown));
    if (input === "]") setSeason(seasons[wrapStep(at, 1, seasons.length)]!.number);
    else if (input === "[") setSeason(seasons[wrapStep(at, -1, seasons.length)]!.number);
  });

  const d = details.value;
  const meta = [
    title.year,
    title.rating !== undefined ? `★ ${title.rating.toFixed(1)}` : null,
    d?.runtime ? `${d.runtime} min` : null,
    d && d.seasons.length > 0 ? `${d.seasons.length} season${d.seasons.length === 1 ? "" : "s"}` : null,
    d?.status,
  ].filter(Boolean);

  // The poster sits to the left when the pane is tall and wide enough, and
  // gives way (or never appears) otherwise.
  const posterRows = Math.min(POSTER_MAX_ROWS, rows);
  const cols = posterCols(posterRows);
  const wantPoster =
    !!title.poster && postersEnabled() && rows >= POSTER_MIN_ROWS && width - cols - POSTER_GAP >= TEXT_MIN_W;
  const poster = usePoster(wantPoster ? title.poster : undefined);
  const showPoster = wantPoster && poster !== "none";
  const bodyW = showPoster ? width - cols - POSTER_GAP : width;

  // Rows: heading, rule, meta, genres, a blank, the overview, a blank and the
  // season heading, then as many episodes as are left. The overview takes what
  // its text needs, up to a third of the pane.
  const textW = Math.max(10, bodyW - 2);
  const overviewMax = Math.max(2, Math.min(4, Math.floor(rows / 3)));
  const overviewRows = Math.min(overviewMax, Math.max(1, Math.ceil(title.overview.length / (textW - 1))));
  const episodeRows = Math.max(0, rows - (7 + overviewRows));
  const list = episodes.value ?? [];

  return (
    <Box>
      {showPoster ? (
        <Box marginRight={POSTER_GAP} flexShrink={0}>
          <Poster img={poster} cols={cols} rows={posterRows} />
        </Box>
      ) : null}
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        <Box>
          <Box flexGrow={1} minWidth={0}>
            <Text bold color={COLOR.text} wrap="truncate-end">{title.title}</Text>
          </Box>
          <Box flexShrink={0} marginLeft={2}>
            <Text color={COLOR.accent} bold>{platformLabel}</Text>
          </Box>
        </Box>
        <Rule width={bodyW} />
        <Text dimColor wrap="truncate-end">{meta.join(`  ${ICON.dot}  `)}</Text>
        <Text dimColor wrap="truncate-end">{d && d.genres.length > 0 ? d.genres.join(", ") : " "}</Text>
        <Box marginTop={1}>
          <Text color={COLOR.text}>
            {title.overview ? clipWords(title.overview, overviewMax * (textW - 1)) : "No description."}
          </Text>
        </Box>
        {title.kind === "tv" && rows >= 8 + overviewRows ? (
          <Box marginTop={1} flexDirection="column">
            {details.loading || episodes.loading ? (
              <Spinner label="Loading episodes…" />
            ) : episodes.error && episodes.error !== "nokey" ? (
              <Text color={COLOR.warn}>{episodes.error}</Text>
            ) : shown === null ? null : (
              <>
                <Text dimColor bold>
                  {`Season ${shown}${seasons.length > 1 ? "   ([ ] to change)" : ""}`}
                </Text>
                {list.slice(0, episodeRows).map((e) => (
                  <Box key={e.number}>
                    <Box width={4} flexShrink={0}>
                      <Text dimColor>{String(e.number).padStart(2, "0")}</Text>
                    </Box>
                    <Box flexGrow={1} minWidth={0}>
                      <Text color={COLOR.text} wrap="truncate-end">{e.name}</Text>
                    </Box>
                    {e.airDate ? (
                      <Box flexShrink={0} marginLeft={1}>
                        <Text dimColor>{e.airDate}</Text>
                      </Box>
                    ) : null}
                  </Box>
                ))}
              </>
            )}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

export function Top() {
  const { region, contentWidth, listRows, setCaptureMode, setResultFocus, setSection, submitQuery } = useStore();
  const focused = region === "content";
  const [platformIdx, setPlatformIdx] = useState(0);
  const [kind, setKind] = useState<TitleKind>("tv");
  // undefined is "popular now"; otherwise one of the last five years.
  const [year, setYear] = useState<number | undefined>(undefined);
  const years = useMemo(() => recentYears(), []);
  const [cursor, setCursor] = useState(0);
  const [detail, setDetail] = useState<TopTitle | null>(null);

  const platform = PLATFORM_TABS[platformIdx]!;
  const top = useTopTitles(platform.id, kind, year);
  const titles = top.value ?? [];
  const clamped = Math.min(cursor, Math.max(0, titles.length - 1));
  // A year's shows say why they are there: new that year, or which season.
  const hasTags = titles.some((t) => t.tag);

  // An open detail owns esc (it closes the detail rather than leaving the
  // pane), the same hand-off Results makes.
  useEffect(() => {
    if (!focused) return;
    setCaptureMode(detail ? "esc" : "none");
    return () => setCaptureMode("none");
  }, [detail, focused, setCaptureMode]);

  useEffect(() => {
    if (!focused) return;
    setResultFocus(detail ? "detail" : "list");
    return () => setResultFocus(null);
  }, [detail, focused, setResultFocus]);

  useEffect(() => {
    if (!focused) setDetail(null);
  }, [focused]);

  const findTorrents = (t: TopTitle): void => {
    // The platform's own tab searches for the title plus the platform's tag,
    // so the releases that come back are that service's.
    setSection(`platform-${platform.id}`);
    submitQuery(t.title);
  };

  useInput(
    (input, key) => {
      if (input === "]") {
        setPlatformIdx((i) => wrapStep(i, 1, PLATFORM_TABS.length));
        setCursor(0);
      } else if (input === "[") {
        setPlatformIdx((i) => wrapStep(i, -1, PLATFORM_TABS.length));
        setCursor(0);
      } else if (input === "v") {
        setKind((k) => (k === "tv" ? "movie" : "tv"));
        setCursor(0);
      } else if (input === "y") {
        // Popular now, then each of the last five years, then back.
        setYear((y) => years[(y === undefined ? -1 : years.indexOf(y)) + 1]);
        setCursor(0);
      } else if (key.upArrow || input === "k") {
        if (titles.length > 0) setCursor(wrapStep(clamped, -1, titles.length));
      } else if (key.downArrow || input === "j") {
        if (titles.length > 0) setCursor(wrapStep(clamped, 1, titles.length));
      } else if (key.return) {
        const t = titles[clamped];
        if (t) setDetail(t);
      } else if (input === "s") {
        const t = titles[clamped];
        if (t) findTorrents(t);
      }
    },
    { isActive: focused && !detail },
  );

  useInput(
    (input, key) => {
      if (key.escape) setDetail(null);
      else if (input === "s" && detail) findTorrents(detail);
    },
    { isActive: focused && !!detail },
  );

  const panelH = Math.max(5, listRows - 1);
  const innerRows = Math.max(1, panelH - 2);
  const rowsForList = Math.max(1, innerRows - 2);
  const start = windowStart(clamped, titles.length, rowsForList);
  const visible = titles.slice(start, start + rowsForList);

  const tab = (label: string, on: boolean) => (
    <Text color={on ? COLOR.accent : undefined} bold={on} dimColor={!on}>
      {label}
    </Text>
  );

  return (
    <Panel title={`top picks ${ICON.dot} ${platform.label}${year === undefined ? "" : ` ${ICON.dot} ${year}`}`} width={contentWidth} focused={focused}
      count={!detail && titles.length > 0 ? `(${titles.length})` : undefined}
      height={panelH}
    >
      {detail ? (
        <Detail title={detail} platformLabel={platform.label} width={Math.max(10, contentWidth - 4)} rows={innerRows} />
      ) : (
        <>
          <Box>
            {tab("Shows", kind === "tv")}
            <Text dimColor>{"  /  "}</Text>
            {tab("Movies", kind === "movie")}
            <Text dimColor>{`   ${ICON.dot}   ${year === undefined ? "popular now" : `${kind === "tv" ? "airing in" : "released in"} ${year}`}   ${ICON.dot}   [ ] platform  v shows/movies  y year`}</Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {top.loading ? (
              <Spinner label="Loading…" />
            ) : top.error ? (
              <Setup error={top.error} />
            ) : titles.length === 0 ? (
              <Text dimColor>{`Nothing ${year === undefined ? "popular" : `${kind === "tv" ? "airing in" : "released in"} ${year}`} on ${platform.label} in your region.`}</Text>
            ) : (
              visible.map((t, i) => {
                const here = start + i === clamped && focused;
                return (
                  <Box key={t.id}>
                    <Box width={GUTTER} flexShrink={0}>
                      <Text color={COLOR.accent} bold>{here ? ICON.pointer : ""}</Text>
                    </Box>
                    <Box width={4} flexShrink={0}>
                      <Text dimColor>{String(start + i + 1).padStart(2)}</Text>
                    </Box>
                    <Box flexGrow={1} minWidth={0}>
                      <Text wrap="truncate-end" bold={here} color={here ? COLOR.accent : undefined} dimColor={!here}>
                        {truncate(t.title, 80)}
                        {t.year ? ` (${t.year})` : ""}
                      </Text>
                    </Box>
                    {hasTags ? (
                      <Box width={TAG_W} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                        <Text color={t.tag === "New" ? COLOR.good : undefined} dimColor={t.tag !== "New"} bold={t.tag === "New"}>
                          {t.tag ?? ""}
                        </Text>
                      </Box>
                    ) : null}
                    <Box width={RATING_W} flexShrink={0} marginLeft={1} justifyContent="flex-end">
                      <Text dimColor={!here} bold={here}>
                        {t.rating !== undefined ? `★ ${t.rating.toFixed(1)}` : ""}
                      </Text>
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </>
      )}
    </Panel>
  );
}
