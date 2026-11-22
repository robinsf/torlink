import { describe, it, expect } from "vitest";
import { posterCols, renderPoster, toRuns } from "./poster";
import type { Pixels } from "../tmdb/poster";

// width x height RGBA, filled by `color(x, y)`.
function image(width: number, height: number, color: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([...color(x, y), 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

const RED: [number, number, number] = [255, 0, 0];
const BLUE: [number, number, number] = [0, 0, 255];

describe("renderPoster", () => {
  it("draws a flat area as an upper half block of one colour", () => {
    const [row] = renderPoster(image(4, 4, () => [10, 20, 30]), 2, 2);
    expect(row![0]).toEqual({ ch: "▀", fg: "#0a141e", bg: "#0a141e" });
  });

  it("puts the upper half of the image above the lower half with a half block", () => {
    const rows = renderPoster(image(2, 4, (_x, y) => (y < 2 ? RED : BLUE)), 1, 2);
    // Two rows of one cell each; each cell is itself flat.
    expect(rows[0]![0]).toMatchObject({ fg: "#ff0000", bg: "#ff0000" });
    expect(rows[1]![0]).toMatchObject({ fg: "#0000ff", bg: "#0000ff" });
    // One row straddling the edge: red on top, blue below.
    const [edge] = renderPoster(image(2, 2, (_x, y) => (y === 0 ? RED : BLUE)), 1, 1);
    expect(edge![0]).toEqual({ ch: "▀", fg: "#ff0000", bg: "#0000ff" });
  });

  it("uses a left or right half block for a vertical edge, which half blocks alone cannot", () => {
    const [row] = renderPoster(image(2, 2, (x) => (x === 0 ? RED : BLUE)), 1, 1);
    expect(row![0]).toEqual({ ch: "▌", fg: "#ff0000", bg: "#0000ff" });
  });

  it("uses a diagonal quadrant block for a diagonal edge", () => {
    const [row] = renderPoster(image(2, 2, (x, y) => (x === y ? RED : BLUE)), 1, 1);
    expect(row![0]).toEqual({ ch: "▚", fg: "#ff0000", bg: "#0000ff" });
  });

  it("isolates a single odd pixel in a quadrant glyph and keeps the rest as the other colour", () => {
    const [row] = renderPoster(image(2, 2, (x, y) => (x === 1 && y === 1 ? RED : BLUE)), 1, 1);
    expect(row![0]).toEqual({ ch: "▗", fg: "#ff0000", bg: "#0000ff" });
  });

  it("averages the source pixels each sample covers", () => {
    // Left column black, right white, shrunk to a single flat-ish sample pair.
    const [row] = renderPoster(image(2, 2, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255])), 1, 1);
    expect(row![0]).toMatchObject({ ch: "▌", fg: "#000000", bg: "#ffffff" });
    const [one] = renderPoster(image(2, 2, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255])), 1, 1);
    expect(one).toHaveLength(1);
  });

  it("makes cols x rows cells even from a tiny source", () => {
    const rows = renderPoster(image(1, 1, () => [10, 20, 30]), 5, 3);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toHaveLength(5);
  });
});

describe("toRuns", () => {
  it("merges neighbours of the same two colours into one run of their glyphs", () => {
    const a = { fg: "#111111", bg: "#222222" };
    const b = { fg: "#333333", bg: "#222222" };
    expect(
      toRuns([
        { ch: "▀", ...a },
        { ch: "▌", ...a },
        { ch: "▀", ...b },
        { ch: "▚", ...a },
      ]),
    ).toEqual([
      { ...a, text: "▀▌" },
      { ...b, text: "▀" },
      { ...a, text: "▚" },
    ]);
  });
});

describe("posterCols", () => {
  it("keeps a 2:3 portrait shape given a cell twice as tall as wide", () => {
    expect(posterCols(12)).toBe(16);
    expect(posterCols(9)).toBe(12);
  });
});
