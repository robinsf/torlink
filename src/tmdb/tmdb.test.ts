import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchResilient } from "../util/net";

vi.mock("../util/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/net")>();
  return { ...actual, fetchResilient: vi.fn() };
});

const mockFetch = vi.mocked(fetchResilient);

const reply = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const askedUrl = (call = 0): URL => new URL(String(mockFetch.mock.calls[call]![0]));
const askedInit = (call = 0): RequestInit => mockFetch.mock.calls[call]![1] as RequestInit;

beforeEach(() => {
  mockFetch.mockReset();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("tmdbKey and tmdbRegion", () => {
  it("reads the key from TORLINK_TMDB_KEY and treats blank as unset", async () => {
    const { tmdbKey } = await import("./client");
    expect(tmdbKey({})).toBeNull();
    expect(tmdbKey({ TORLINK_TMDB_KEY: "   " })).toBeNull();
    expect(tmdbKey({ TORLINK_TMDB_KEY: " abc " })).toBe("abc");
  });

  it("defaults the region to US and accepts only a two-letter code", async () => {
    const { tmdbRegion } = await import("./client");
    expect(tmdbRegion({})).toBe("US");
    expect(tmdbRegion({ TORLINK_TMDB_REGION: "gb" })).toBe("GB");
    expect(tmdbRegion({ TORLINK_TMDB_REGION: "usa" })).toBe("US");
  });
});

describe("tmdbGet", () => {
  it("sends a v3 key as the api_key parameter, with no auth header", async () => {
    const { tmdbGet } = await import("./client");
    mockFetch.mockResolvedValueOnce(reply({ ok: 1 }));
    await tmdbGet("/x", { a: "1" }, { key: "v3key" });
    expect(askedUrl().searchParams.get("api_key")).toBe("v3key");
    expect(askedUrl().searchParams.get("a")).toBe("1");
    expect(askedInit().headers).not.toHaveProperty("Authorization");
  });

  it("sends a v4 read token as a bearer header and keeps it out of the URL", async () => {
    const { tmdbGet } = await import("./client");
    mockFetch.mockResolvedValueOnce(reply({ ok: 1 }));
    await tmdbGet("/x", {}, { key: "eyJhbGciOi.payload.sig" });
    expect(askedInit().headers).toMatchObject({ Authorization: "Bearer eyJhbGciOi.payload.sig" });
    expect(String(mockFetch.mock.calls[0]![0])).not.toContain("eyJ");
  });

  it("throws a 401 HttpError without a key, and when TMDB rejects it", async () => {
    const { tmdbGet } = await import("./client");
    await expect(tmdbGet("/x", {})).rejects.toMatchObject({ status: 401 });
    expect(mockFetch).not.toHaveBeenCalled();
    mockFetch.mockResolvedValueOnce(reply({}, 401));
    await expect(tmdbGet("/x", {}, { key: "bad" })).rejects.toMatchObject({ status: 401 });
  });

  it("throws an HttpError carrying the status for other failures", async () => {
    const { tmdbGet } = await import("./client");
    mockFetch.mockResolvedValueOnce(reply({}, 503));
    await expect(tmdbGet("/x", {}, { key: "k" })).rejects.toMatchObject({ status: 503 });
  });
});

describe("topTitles", () => {
  const SHOWS = {
    results: [
      { id: 1, name: "Severance", first_air_date: "2022-02-18", vote_average: 8.4123, vote_count: 900, overview: "<b>Mark</b> works\u001b]52;c;x\u0007 at Lumon." },
      { id: 2, name: "No Votes", first_air_date: "", vote_average: 0, vote_count: 0, overview: "" },
      { id: 3, name: "", overview: "nameless" },
      { name: "no id" },
    ],
  };

  it("asks for the platform's most popular included titles in the region", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    vi.stubEnv("TORLINK_TMDB_REGION", "GB");
    const { topTitles } = await import("./top");
    mockFetch.mockResolvedValueOnce(reply(SHOWS));
    await topTitles("appletv", "tv");
    const url = askedUrl();
    expect(url.pathname).toBe("/3/discover/tv");
    expect(url.searchParams.get("with_watch_providers")).toBe("350");
    expect(url.searchParams.get("watch_region")).toBe("GB");
    expect(url.searchParams.get("with_watch_monetization_types")).toBe("flatrate");
    expect(url.searchParams.get("sort_by")).toBe("popularity.desc");
  });

  it("maps rows, drops unusable ones and strips markup and control characters", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { topTitles } = await import("./top");
    mockFetch.mockResolvedValueOnce(reply(SHOWS));
    const out = await topTitles("appletv", "tv");
    expect(out.map((t) => t.title)).toEqual(["Severance", "No Votes"]);
    expect(out[0]).toMatchObject({ id: 1, kind: "tv", year: "2022", rating: 8.4 });
    expect(out[0]!.overview).toBe("Mark works]52;c;x at Lumon.");
    expect(out[1]).toMatchObject({ year: undefined, rating: undefined });
  });

  it("filters a show by episodes airing in the year, and a film by its release year", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { topTitles } = await import("./top");
    mockFetch.mockResolvedValueOnce(reply({ results: [] }));
    await topTitles("netflix", "tv", { year: 2024 });
    // A returning show counts for every year it airs in, not just its debut.
    expect(askedUrl(0).searchParams.get("air_date.gte")).toBe("2024-01-01");
    expect(askedUrl(0).searchParams.get("air_date.lte")).toBe("2024-12-31");
    expect(askedUrl(0).searchParams.has("first_air_date_year")).toBe(false);
    expect(askedUrl(0).searchParams.has("primary_release_year")).toBe(false);
    mockFetch.mockResolvedValueOnce(reply({ results: [] }));
    await topTitles("netflix", "movie", { year: 2023 });
    expect(askedUrl(1).searchParams.get("primary_release_year")).toBe("2023");
    expect(askedUrl(1).searchParams.has("air_date.gte")).toBe(false);
  });

  it("keeps each year's list apart in the cache, and sends no year for popular now", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { topTitles } = await import("./top");
    mockFetch.mockResolvedValue(reply({ results: [] }));
    await topTitles("hulu", "tv");
    await topTitles("hulu", "tv", { year: 2025 });
    await topTitles("hulu", "tv", { year: 2025 });
    await topTitles("hulu", "tv", { year: 2024 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(askedUrl(0).searchParams.has("air_date.gte")).toBe(false);
  });

  it("lists the newest five calendar years, newest first", async () => {
    const { recentYears } = await import("./top");
    expect(recentYears(new Date("2026-11-22T12:00:00Z"))).toEqual([2026, 2025, 2024, 2023, 2022]);
    expect(recentYears(new Date("2026-11-22T12:00:00Z"), 2)).toEqual([2026, 2025]);
  });

  it("reads a film's title and release date", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { topTitles } = await import("./top");
    mockFetch.mockResolvedValueOnce(
      reply({ results: [{ id: 9, title: "Dune", release_date: "2021-10-22", vote_average: 7.8, vote_count: 10 }] }),
    );
    const [dune] = await topTitles("netflix", "movie");
    expect(askedUrl().pathname).toBe("/3/discover/movie");
    expect(dune).toMatchObject({ title: "Dune", year: "2021", kind: "movie" });
  });

  it("answers a repeat from its cache and skips unknown platforms", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { topTitles } = await import("./top");
    mockFetch.mockResolvedValueOnce(reply(SHOWS));
    await topTitles("hulu", "tv");
    await topTitles("hulu", "tv");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await topTitles("crunchyroll", "tv")).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("titleDetails and seasonEpisodes", () => {
  it("lists a show's seasons without specials, and its genres", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { titleDetails } = await import("./top");
    mockFetch.mockResolvedValueOnce(
      reply({
        genres: [{ name: "Drama" }, { name: "Sci-Fi" }],
        tagline: "Work is mysterious.",
        status: "Returning Series",
        seasons: [
          { season_number: 0, name: "Specials", episode_count: 3 },
          { season_number: 1, name: "Season 1", episode_count: 9 },
          { season_number: 2, episode_count: 10 },
        ],
      }),
    );
    const d = await titleDetails("tv", 1);
    expect(askedUrl().pathname).toBe("/3/tv/1");
    expect(d.genres).toEqual(["Drama", "Sci-Fi"]);
    expect(d.seasons).toEqual([
      { number: 1, name: "Season 1", episodes: 9 },
      { number: 2, name: "Season 2", episodes: 10 },
    ]);
  });

  it("reads a film's running time", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { titleDetails } = await import("./top");
    mockFetch.mockResolvedValueOnce(reply({ genres: [], runtime: 155 }));
    expect((await titleDetails("movie", 9)).runtime).toBe(155);
  });

  it("maps a season's episodes, keeping only well-formed air dates", async () => {
    vi.stubEnv("TORLINK_TMDB_KEY", "k");
    const { seasonEpisodes } = await import("./top");
    mockFetch.mockResolvedValueOnce(
      reply({
        episodes: [
          { episode_number: 1, name: "Good News", overview: "Pilot.", air_date: "2022-02-18" },
          { episode_number: 2, air_date: "not a date" },
          { name: "no number" },
        ],
      }),
    );
    expect(await seasonEpisodes(1, 2)).toEqual([
      { number: 1, name: "Good News", overview: "Pilot.", airDate: "2022-02-18" },
      { number: 2, name: "Episode 2", overview: "", airDate: undefined },
    ]);
    expect(askedUrl().pathname).toBe("/3/tv/1/season/2");
  });
});
