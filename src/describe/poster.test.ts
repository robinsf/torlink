import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TorrentResult } from "../sources/types";

const searchTitle = vi.hoisted(() => vi.fn());
vi.mock("../tmdb/search", () => ({ searchTitle }));

const result = (name: string, source: TorrentResult["source"]): TorrentResult => ({
  infoHash: "a".repeat(40),
  name,
  source,
  sizeBytes: 1,
  seeders: 1,
  leechers: 0,
  magnet: "m",
});

beforeEach(() => {
  searchTitle.mockReset();
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canPoster", () => {
  it("covers films, shows and anime, not games", async () => {
    const { canPoster } = await import("./poster");
    expect(canPoster(result("Dune (2021) [1080p] [WEBRip]", "yts"))).toBe(true);
    expect(canPoster(result("Severance.S02E03.2160p.ATVP.WEB-DL", "eztv"))).toBe(true);
    expect(canPoster(result("[SubsPlease] One Piece - 1173 (1080p) [12A957B2]", "subsplease"))).toBe(true);
    expect(canPoster(result("[Erai-raws] Frieren S02E03 1080p", "nyaa"))).toBe(true);
    expect(canPoster(result("Elden Ring (2022) v1.10", "fitgirl"))).toBe(false);
  });

  it("does not guess for a Movies and TV source whose name gives no hint", async () => {
    const { canPoster } = await import("./poster");
    expect(canPoster(result("Inception 1080p BluRay", "knaben"))).toBe(false);
    expect(canPoster(result("Inception (2010) 1080p BluRay", "knaben"))).toBe(true);
  });

  it("is off with TORLINK_NO_DESCRIPTIONS, which turns every title lookup off", async () => {
    vi.stubEnv("TORLINK_NO_DESCRIPTIONS", "1");
    const { canPoster, findPoster } = await import("./poster");
    const r = result("Dune (2021) [1080p]", "yts");
    expect(canPoster(r)).toBe(false);
    expect(await findPoster(r, "https://static.tvmaze.com/uploads/images/medium_portrait/1/2.jpg")).toBeNull();
    expect(searchTitle).not.toHaveBeenCalled();
  });
});

describe("findPoster", () => {
  const FALLBACK = "https://static.tvmaze.com/uploads/images/medium_portrait/528/1320416.jpg";

  it("asks TMDB first, with the release's title, year and kind, when a key is set", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    searchTitle.mockResolvedValueOnce({ poster: "/tmdb.jpg" });
    const { findPoster } = await import("./poster");
    const src = await findPoster(result("Dune (2021) [1080p] [WEBRip]", "yts"), FALLBACK);
    expect(src).toEqual({ tmdb: "/tmdb.jpg" });
    expect(searchTitle).toHaveBeenCalledWith("movie", "Dune", 2021, expect.anything());
  });

  it("strips an anime release's episode number before searching, as a show", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    searchTitle.mockResolvedValue({ poster: "/op.jpg" });
    const { findPoster } = await import("./poster");
    await findPoster(result("[SubsPlease] One Piece - 1173 (1080p) [12A957B2]", "subsplease"), undefined);
    expect(searchTitle).toHaveBeenCalledWith("tv", "One Piece", undefined, expect.anything());
  });

  it("falls back to the description service's poster with no key, or no TMDB match", async () => {
    const { findPoster } = await import("./poster");
    const r = result("Severance.S02E03.2160p.ATVP.WEB-DL", "eztv");
    expect(await findPoster(r, FALLBACK)).toEqual({ url: FALLBACK });
    expect(searchTitle).not.toHaveBeenCalled();

    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    searchTitle.mockResolvedValueOnce(null);
    expect(await findPoster(r, FALLBACK)).toEqual({ url: FALLBACK });
  });

  it("falls back when the TMDB lookup fails", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    searchTitle.mockRejectedValueOnce(new Error("offline"));
    const { findPoster } = await import("./poster");
    expect(await findPoster(result("Dune (2021) [1080p]", "yts"), FALLBACK)).toEqual({ url: FALLBACK });
  });

  it("returns null when nothing has a poster, and never trusts an off-host fallback", async () => {
    const { findPoster } = await import("./poster");
    const r = result("Dune (2021) [1080p]", "yts");
    expect(await findPoster(r, undefined)).toBeNull();
    expect(await findPoster(r, "https://evil.example/p.jpg")).toBeNull();
    expect(await findPoster(result("Elden Ring (2022)", "fitgirl"), FALLBACK)).toBeNull();
  });
});
