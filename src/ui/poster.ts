import type { Pixels } from "../tmdb/poster";

// One terminal cell shows two pixels, one above the other: the upper half
// block takes the top pixel as its foreground and the bottom as its background.
export interface Cell {
  top: string;
  bottom: string;
}

const hex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

// Shrink an image to cols x (rows * 2) pixels by averaging every source pixel
// that falls in each target pixel, so detail blurs instead of aliasing, and
// return it as rows of cells.
export function renderPoster(img: Pixels, cols: number, rows: number): Cell[][] {
  const w = Math.max(1, cols);
  const h = Math.max(1, rows) * 2;
  const sample = (x: number, y: number): string => {
    const x0 = Math.floor((x * img.width) / w);
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let sy = y0; sy < Math.min(y1, img.height); sy++) {
      for (let sx = x0; sx < Math.min(x1, img.width); sx++) {
        const i = (sy * img.width + sx) * 4;
        r += img.data[i]!;
        g += img.data[i + 1]!;
        b += img.data[i + 2]!;
        n++;
      }
    }
    return n === 0 ? "#000000" : `#${hex(r / n)}${hex(g / n)}${hex(b / n)}`;
  };

  const out: Cell[][] = [];
  for (let row = 0; row < Math.max(1, rows); row++) {
    const cells: Cell[] = [];
    for (let x = 0; x < w; x++) cells.push({ top: sample(x, row * 2), bottom: sample(x, row * 2 + 1) });
    out.push(cells);
  }
  return out;
}

// Rows of same-coloured neighbours merged into one run, so a poster is a few
// hundred text nodes rather than thousands.
export interface Run {
  top: string;
  bottom: string;
  length: number;
}

export function toRuns(row: Cell[]): Run[] {
  const runs: Run[] = [];
  for (const c of row) {
    const last = runs.at(-1);
    if (last && last.top === c.top && last.bottom === c.bottom) last.length++;
    else runs.push({ top: c.top, bottom: c.bottom, length: 1 });
  }
  return runs;
}

// The cells a poster of this many rows needs across, keeping TMDB's 2:3
// portrait shape given that a cell is about twice as tall as it is wide and
// carries two pixels vertically.
export function posterCols(rows: number): number {
  return Math.round(rows / 0.75);
}
