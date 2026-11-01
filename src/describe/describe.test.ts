import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchResilient } from "../util/net";
import type { TorrentResult } from "../sources/types";

vi.mock("../util/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/net")>();
  return { ...actual, fetchResilient: vi.fn() };
});

const mockFetch = vi.mocked(fetchResilient);

const reply = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const result = (name: string, source: TorrentResult["source"]): TorrentResult => ({
  infoHash: "a".repeat(40),
  name,
  source,
  sizeBytes: 1,
  seeders: 1,
  leechers: 0,
  magnet: "magnet:?xt=urn:btih:" + "a".repeat(40),
});

const askedUrl = (call: number): string => String(mockFetch.mock.calls[call]![0]);

const SHOW = {
  id: 169,
  name: "Breaking Bad",
  premiered: "2008-01-20",
  genres: ["Drama", "Crime"],
  summary: "<p>A chemistry teacher turns to crime.</p>",
};

beforeEach(() => {
  mockFetch.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("describeResult", () => {
  it("describes the episode a TV release names", async () => {
    const { describeResult } = await import("./index");
    mockFetch.mockResolvedValueOnce(reply(SHOW));
    mockFetch.mockResolvedValueOnce(
      reply({ name: "Bit by a Dead Bee", summary: "<p>Walt and Jesse cover their tracks.</p>" }),
    );
    const d = await describeResult(result("Breaking.Bad.S02E03.1080p.BluRay", "eztv"));
    expect(d).toEqual({
      heading: "Breaking Bad · S02E03 · Bit by a Dead Bee",
      text: "Walt and Jesse cover their tracks.",
      via: "TVmaze",
    });
    expect(askedUrl(0)).toBe("https://api.tvmaze.com/singlesearch/shows?q=Breaking%20Bad");
    expect(askedUrl(1)).toBe("https://api.tvmaze.com/shows/169/episodebynumber?season=2&number=3");
  });

  it("falls back to the show when TVmaze does not know the episode", async () => {
    const { describeResult } = await import("./index");
    mockFetch.mockResolvedValueOnce(reply(SHOW));
    mockFetch.mockResolvedValueOnce(reply({}, 404));
    const d = await describeResult(result("Breaking.Bad.S09E99.720p", "eztv"));
    expect(d).toMatchObject({
      heading: "Breaking Bad (2008) · Season 9 · Drama, Crime",
      text: "A chemistry teacher turns to crime.",
      via: "TVmaze",
    });
  });

  it("describes a season pack by its show, naming the season", async () => {
    const { describeResult } = await import("./index");
    mockFetch.mockResolvedValueOnce(reply(SHOW));
    const d = await describeResult(result("Breaking Bad S01 COMPLETE 1080p", "tpb-tv"));
    expect(d?.heading).toBe("Breaking Bad (2008) · Season 1 · Drama, Crime");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("finds the film's Wikipedia article, preferring the release's year", async () => {
    const { describeResult } = await import("./index");
    mockFetch.mockResolvedValueOnce(
      reply({
        pages: [
          { key: "Dune_(1984_film)", title: "Dune (1984 film)", description: "1984 film by David Lynch" },
          { key: "Dune_(2021_film)", title: "Dune (2021 film)", description: "Film by Denis Villeneuve" },
          { key: "Dune_(novel)", title: "Dune (novel)", description: "1965 science fiction novel" },
        ],
      }),
    );
    mockFetch.mockResolvedValueOnce(
      reply({ title: "Dune (2021 film)", description: "Film by Denis Villeneuve", extract: "Dune is a 2021 epic." }),
    );
    const d = await describeResult(result("Dune (2021) [1080p] [WEBRip]", "yts"));
    expect(d).toEqual({
      heading: "Dune · Film by Denis Villeneuve",
      text: "Dune is a 2021 epic.",
      via: "Wikipedia",
    });
    expect(askedUrl(0)).toContain("q=Dune%202021%20film");
    expect(askedUrl(1)).toBe("https://en.wikipedia.org/api/rest_v1/page/summary/Dune_(2021_film)");
  });

  it("returns null when no article is a film with that title", async () => {
    const { describeResult } = await import("./index");
    mockFetch.mockResolvedValueOnce(
      reply({ pages: [{ key: "Dune_(novel)", title: "Dune (novel)", description: "1965 novel" }] }),
    );
    expect(await describeResult(result("Dune (2021) 1080p", "yts"))).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("never looks up a game or anime release", async () => {
    const { describeResult, canDescribe } = await import("./index");
    for (const [name, source] of [
      ["Elden Ring (2022) v1.10", "fitgirl"],
      ["[SubsPlease] One Piece - 1173 (1080p)", "subsplease"],
      ["[Erai-raws] Frieren S02E03 1080p", "nyaa"],
    ] as const) {
      const r = result(name, source);
      expect(canDescribe(r)).toBe(false);
      expect(await describeResult(r)).toBeNull();
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not guess when a source feeding Movies and TV gives no hint", async () => {
    const { canDescribe } = await import("./index");
    expect(canDescribe(result("Inception 1080p BluRay", "knaben"))).toBe(false);
    expect(canDescribe(result("Inception (2010) 1080p BluRay", "knaben"))).toBe(true);
    expect(canDescribe(result("Severance S02E01 1080p", "knaben"))).toBe(true);
  });

  it("makes no request at all when TORLINK_NO_DESCRIPTIONS is set", async () => {
    vi.stubEnv("TORLINK_NO_DESCRIPTIONS", "1");
    const { describeResult, canDescribe } = await import("./index");
    const r = result("Dune (2021) [1080p]", "yts");
    expect(canDescribe(r)).toBe(false);
    expect(await describeResult(r)).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("answers a repeat lookup from its cache, and does not cache a failure", async () => {
    const { describeResult } = await import("./index");
    mockFetch.mockResolvedValueOnce(reply(SHOW));
    await describeResult(result("Breaking Bad S01 1080p", "eztv"));
    await describeResult(result("Breaking Bad S01 720p", "eztv"));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockRejectedValueOnce(new Error("offline"));
    await expect(describeResult(result("Severance S01 1080p", "eztv"))).rejects.toThrow("offline");
    mockFetch.mockResolvedValueOnce(reply({ ...SHOW, id: 1, name: "Severance" }));
    expect((await describeResult(result("Severance S01 1080p", "eztv")))?.heading).toContain("Severance");
  });
});
