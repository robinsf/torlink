import { describe, it, expect } from "vitest";
import { parseRelease } from "./parse";

describe("parseRelease", () => {
  it.each([
    ["Breaking.Bad.S02E03.1080p.BluRay.x265-GRP", { title: "Breaking Bad", season: 2, episode: 3 }],
    ["The Last of Us 1x05 720p HDTV", { title: "The Last of Us", season: 1, episode: 5 }],
    ["Breaking Bad S01 COMPLETE 1080p 10bit BluRay", { title: "Breaking Bad", season: 1 }],
    ["Severance Season 2 (2025) 1080p WEB-DL", { title: "Severance", season: 2, year: 2025 }],
    ["Dune (2021) [1080p] [WEBRip]", { title: "Dune", year: 2021 }],
    ["Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.HEVC", { title: "Dune Part Two", year: 2024 }],
    ["[YTS] Old School (2003) [720p]", { title: "Old School", year: 2003 }],
    ["2012 (2009) 1080p BluRay", { title: "2012", year: 2009 }],
    ["Inception 1080p BluRay x264", { title: "Inception" }],
  ])("reads %j", (name, expected) => {
    expect(parseRelease(name)).toEqual(expect.objectContaining(expected));
  });

  it("leaves year and season unset when the name has none", () => {
    const info = parseRelease("Inception 1080p BluRay x264")!;
    expect(info.year).toBeUndefined();
    expect(info.season).toBeUndefined();
  });

  it.each(["", "1080p BluRay x264", "[Group] S01E02"])("returns null for %j (no title left)", (name) => {
    expect(parseRelease(name)).toBeNull();
  });
});
