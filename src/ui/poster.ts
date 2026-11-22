import type { Pixels } from "../tmdb/poster";

// One terminal cell shows up to four pixels, two across and two down, drawn
// with a quadrant block character in two colours: the glyph's filled quadrants
// take the foreground, the rest the background.
export interface Cell {
  ch: string;
  fg: string;
  bg: string;
}

type RGB = [number, number, number];

const hex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const toHex = ([r, g, b]: RGB): string => `#${hex(r)}${hex(g)}${hex(b)}`;

// The ways to split a cell's four pixels into two groups, as a bit set of the
// foreground ones (bit 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right)
// with the glyph that fills exactly those quadrants. A split and its mirror are
// the same two groups, so seven cover them all. The top/bottom split is first:
// on a tie (a flat area) it is the one drawn, as a plain upper half block.
const SPLITS: readonly { mask: number; ch: string }[] = [
  { mask: 0b0011, ch: "▀" },
  { mask: 0b0101, ch: "▌" },
  { mask: 0b1001, ch: "▚" },
  { mask: 0b0001, ch: "▘" },
  { mask: 0b0010, ch: "▝" },
  { mask: 0b0100, ch: "▖" },
  { mask: 0b1000, ch: "▗" },
];

function mean(pixels: readonly RGB[], pick: (i: number) => boolean): { color: RGB; n: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  pixels.forEach((p, i) => {
    if (!pick(i)) return;
    r += p[0];
    g += p[1];
    b += p[2];
    n++;
  });
  return { color: n === 0 ? [0, 0, 0] : [r / n, g / n, b / n], n };
}

// The split of four pixels into two colours that loses the least, and the cell
// it makes.
function bestCell(pixels: readonly RGB[]): Cell {
  let best: { err: number; cell: Cell } | null = null;
  for (const { mask, ch } of SPLITS) {
    const fg = mean(pixels, (i) => ((mask >> i) & 1) === 1).color;
    const bg = mean(pixels, (i) => ((mask >> i) & 1) === 0).color;
    let err = 0;
    pixels.forEach((p, i) => {
      const c = ((mask >> i) & 1) === 1 ? fg : bg;
      err += (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    });
    if (best === null || err < best.err) best = { err, cell: { ch, fg: toHex(fg), bg: toHex(bg) } };
  }
  return best!.cell;
}

// Shrink an image to (2 * cols) x (2 * rows) pixels by averaging every source
// pixel that falls in each target pixel, so detail blurs instead of aliasing,
// then turn each 2x2 block into a cell.
export function renderPoster(img: Pixels, cols: number, rows: number): Cell[][] {
  const c = Math.max(1, cols);
  const r = Math.max(1, rows);
  const w = c * 2;
  const h = r * 2;
  const sample = (x: number, y: number): RGB => {
    const x0 = Math.floor((x * img.width) / w);
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let sy = y0; sy < Math.min(y1, img.height); sy++) {
      for (let sx = x0; sx < Math.min(x1, img.width); sx++) {
        const i = (sy * img.width + sx) * 4;
        sr += img.data[i]!;
        sg += img.data[i + 1]!;
        sb += img.data[i + 2]!;
        n++;
      }
    }
    return n === 0 ? [0, 0, 0] : [sr / n, sg / n, sb / n];
  };

  const out: Cell[][] = [];
  for (let row = 0; row < r; row++) {
    const cells: Cell[] = [];
    for (let col = 0; col < c; col++) {
      const x = col * 2;
      const y = row * 2;
      cells.push(bestCell([sample(x, y), sample(x + 1, y), sample(x, y + 1), sample(x + 1, y + 1)]));
    }
    out.push(cells);
  }
  return out;
}

// Neighbours of the same two colours merged into one run of text, so a poster
// is a few hundred text nodes rather than thousands.
export interface Run {
  fg: string;
  bg: string;
  text: string;
}

export function toRuns(row: Cell[]): Run[] {
  const runs: Run[] = [];
  for (const c of row) {
    const last = runs.at(-1);
    if (last && last.fg === c.fg && last.bg === c.bg) last.text += c.ch;
    else runs.push({ fg: c.fg, bg: c.bg, text: c.ch });
  }
  return runs;
}

// The cells a poster of this many rows needs across, keeping TMDB's 2:3
// portrait shape given that a cell is about twice as tall as it is wide.
export function posterCols(rows: number): number {
  return Math.round(rows / 0.75);
}
