import { describe, expect, it } from "vitest";
import { POSTER_GAP, posterBox } from "./Poster";

describe("posterBox", () => {
  it("is as tall as the pane allows, up to 32 rows, in a roomy pane", () => {
    expect(posterBox(40, 120)).toEqual({ rows: 32, cols: 43 });
    expect(posterBox(14, 120)).toEqual({ rows: 14, cols: 19 });
  });

  it("shrinks to leave the text its width instead of giving up, in a narrow pane", () => {
    const box = posterBox(30, 55)!;
    expect(box.rows).toBeLessThan(30);
    expect(55 - box.cols - POSTER_GAP).toBeGreaterThanOrEqual(36);
    expect(box.rows).toBeGreaterThanOrEqual(8);
  });

  it("is null when the pane is too short or too narrow for a poster worth drawing", () => {
    expect(posterBox(7, 120)).toBeNull();
    expect(posterBox(30, 46)).toBeNull();
  });
});
