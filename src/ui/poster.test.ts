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

describe("renderPoster", () => {
  it("puts the upper half of the image in each cell's top pixel and the lower half in its bottom", () => {
    const img = image(4, 8, (_x, y) => (y < 4 ? [255, 0, 0] : [0, 0, 255]));
    const rows = renderPoster(img, 2, 2);
    // 2 rows of cells = 4 pixel rows: red, red, blue, blue.
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]).toEqual({ top: "#ff0000", bottom: "#ff0000" });
    expect(rows[1]![1]).toEqual({ top: "#0000ff", bottom: "#0000ff" });
  });

  it("averages the pixels a cell covers", () => {
    // Left column black, right column white, shrunk to one pixel wide.
    const img = image(2, 2, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255]));
    const [row] = renderPoster(img, 1, 1);
    expect(row![0]!.top).toBe("#808080");
  });

  it("makes cols x rows cells even from a tiny source", () => {
    const rows = renderPoster(image(1, 1, () => [10, 20, 30]), 5, 3);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r).toHaveLength(5);
      expect(r[0]).toEqual({ top: "#0a141e", bottom: "#0a141e" });
    }
  });
});

describe("toRuns", () => {
  it("merges neighbours of the same colour", () => {
    const a = { top: "#111111", bottom: "#222222" };
    const b = { top: "#333333", bottom: "#222222" };
    expect(toRuns([a, a, b, a, a, a])).toEqual([
      { ...a, length: 2 },
      { ...b, length: 1 },
      { ...a, length: 3 },
    ]);
  });
});

describe("posterCols", () => {
  it("keeps a 2:3 portrait shape given a cell twice as tall as wide", () => {
    expect(posterCols(12)).toBe(16);
    expect(posterCols(9)).toBe(12);
  });
});
