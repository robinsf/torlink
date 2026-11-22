import { describe, it, expect } from "vitest";
import { detectPlatform, platformsIn, platformSearchText } from "./platform";
import type { TorrentResult } from "../sources/types";

const r = (name: string): TorrentResult => ({
  infoHash: name,
  name,
  source: "eztv",
  sizeBytes: 0,
  seeders: 0,
  leechers: 0,
  magnet: "m",
});

describe("detectPlatform", () => {
  it.each([
    ["Show.S01E01.1080p.NF.WEB-DL.DDP5.1.x264-GRP", "Netflix"],
    ["Show S02 2160p AMZN WEB-DL DDP5 1 H 265", "Prime Video"],
    ["Show.S01E03.2160p.ATVP.WEB-DL.DDP5.1.Atmos.H.265", "Apple TV+"],
    ["Show.S01.1080p.DSNP.WEB-DL", "Disney+"],
    ["Show.S01.1080p.HMAX.WEB-DL", "Max"],
    ["Show S01 1080p MAX WEB-DL", "Max"],
    ["Show.S01.1080p.PMTP.WEB-DL", "Paramount+"],
    ["Show.S01.1080p.PCOK.WEB-DL", "Peacock"],
    ["Show.S01.1080p.HULU.WEB-DL", "Hulu"],
    ["[Group] Show - 03 (CR WEB-DL 1080p)", "Crunchyroll"],
    ["Show S01 Netflix Original 1080p", "Netflix"],
  ])("reads %j as %s", (name, label) => {
    expect(detectPlatform(name)?.label).toBe(label);
  });

  it.each([
    "Show.S01.1080p.BluRay.x264",
    "Mad Max Fury Road 2015 1080p BluRay",
    "Monkey nf archive 1080p",
    "Information.S01.1080p.WEB-DL",
  ])("finds no platform in %j", (name) => {
    expect(detectPlatform(name)).toBeNull();
  });
});

describe("platformSearchText", () => {
  it("carries the aliases the filter should answer to", () => {
    expect(platformSearchText(r("Show S01 1080p AMZN WEB-DL"))).toContain("amazon");
    expect(platformSearchText(r("Show S01 1080p BluRay"))).toBe("");
  });
});

describe("platformsIn", () => {
  it("lists each platform present once, in the fixed platform order", () => {
    const list = [r("A S01 AMZN"), r("B S01 NF"), r("C S01 NF"), r("D S01 BluRay")];
    expect(platformsIn(list).map((p) => p.label)).toEqual(["Netflix", "Prime Video"]);
  });
});
