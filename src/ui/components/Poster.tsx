import { useMemo } from "react";
import { Box, Text } from "ink";
import { posterCols, renderPoster, toRuns } from "../poster";
import type { Pixels } from "../../tmdb/poster";

// A poster needs this much height and leaves the text this much width.
const POSTER_MIN_ROWS = 8;
const POSTER_MAX_ROWS = 32;
export const POSTER_GAP = 2;
const TEXT_MIN_W = 36;

// The size a poster is drawn at in a pane `rows` tall and `width` wide: as tall
// as the pane allows, shrunk to keep the text its minimum width, or null when
// that leaves too little for a poster to be worth drawing.
export function posterBox(rows: number, width: number): { rows: number; cols: number } | null {
  const maxCols = width - POSTER_GAP - TEXT_MIN_W;
  const h = Math.min(POSTER_MAX_ROWS, rows, Math.floor(maxCols * 0.75));
  if (h < POSTER_MIN_ROWS) return null;
  return { rows: h, cols: posterCols(h) };
}

// The poster as half-block cells; an empty box of the same size while the
// image is still loading, so the text does not jump when it lands.
export function Poster({ img, cols, rows }: { img: Pixels | null; cols: number; rows: number }) {
  const cells = useMemo(() => (img ? renderPoster(img, cols, rows) : null), [img, cols, rows]);
  if (!cells) return <Box width={cols} height={rows} flexShrink={0} />;
  return (
    <Box flexDirection="column" width={cols} flexShrink={0}>
      {cells.map((row, y) => (
        <Text key={y}>
          {toRuns(row).map((run, i) => (
            <Text key={i} color={run.fg} backgroundColor={run.bg}>
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
