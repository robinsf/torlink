import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchResilient } from "../util/net";

vi.mock("../util/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/net")>();
  return { ...actual, fetchResilient: vi.fn() };
});

const mockFetch = vi.mocked(fetchResilient);
const reply = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  mockFetch.mockReset();
  vi.resetModules();
});

const KEY = { key: "k" };

describe("searchTitle", () => {
  it("searches the right endpoint for the kind, without adult results", async () => {
    const { searchTitle } = await import("./search");
    mockFetch.mockResolvedValue(reply({ results: [] }));
    await searchTitle("tv", "Severance", undefined, KEY);
    await searchTitle("movie", "Dune", 2021, KEY);
    const tv = new URL(String(mockFetch.mock.calls[0]![0]));
    expect(tv.pathname).toBe("/3/search/tv");
    expect(tv.searchParams.get("query")).toBe("Severance");
    expect(tv.searchParams.get("include_adult")).toBe("false");
    expect(new URL(String(mockFetch.mock.calls[1]![0])).pathname).toBe("/3/search/movie");
  });

  it("takes only an entry whose title is the searched title, never a near miss", async () => {
    const { searchTitle } = await import("./search");
    mockFetch.mockResolvedValueOnce(
      reply({
        results: [
          { name: "Dune: Prophecy", poster_path: "/wrong1.jpg" },
          { name: "Severance", poster_path: "/right.jpg" },
          { name: "Severance Pay", poster_path: "/wrong2.jpg" },
        ],
      }),
    );
    expect(await searchTitle("tv", "severance", undefined, KEY)).toEqual({ poster: "/right.jpg" });
  });

  it("matches the original title too, ignoring case, punctuation and accents-free spacing", async () => {
    const { searchTitle } = await import("./search");
    mockFetch.mockResolvedValueOnce(
      reply({ results: [{ name: "Sousou no Frieren", original_name: "葬送のフリーレン", poster_path: "/jp.jpg" }, { name: "Frieren: Beyond Journey's End", original_name: "Sousou no Frieren", poster_path: "/en.jpg" }] }),
    );
    expect(await searchTitle("tv", "Sousou no Frieren", undefined, KEY)).toEqual({ poster: "/jp.jpg" });
    mockFetch.mockResolvedValueOnce(reply({ results: [{ title: "Spider-Man: No Way Home", poster_path: "/sm.jpg" }] }));
    expect(await searchTitle("movie", "spider man no way home", undefined, KEY)).toEqual({ poster: "/sm.jpg" });
  });

  it("prefers the entry from the release's year, else the most popular (first)", async () => {
    const { searchTitle } = await import("./search");
    const rows = {
      results: [
        { title: "Dune", release_date: "1984-12-14", poster_path: "/old.jpg" },
        { title: "Dune", release_date: "2021-10-22", poster_path: "/new.jpg" },
      ],
    };
    mockFetch.mockResolvedValueOnce(reply(rows));
    expect(await searchTitle("movie", "Dune", 2021, KEY)).toEqual({ poster: "/new.jpg" });
    mockFetch.mockResolvedValueOnce(reply(rows));
    expect(await searchTitle("movie", "Dune ", 1999, KEY)).toEqual({ poster: "/old.jpg" });
  });

  it("skips entries with no poster or a poster path off TMDB's shape", async () => {
    const { searchTitle } = await import("./search");
    mockFetch.mockResolvedValueOnce(
      reply({ results: [{ name: "Show", poster_path: null }, { name: "Show", poster_path: "/../x.jpg" }, { name: "Show", poster_path: "https://evil.example/p.jpg" }] }),
    );
    expect(await searchTitle("tv", "Show", undefined, KEY)).toBeNull();
  });

  it("caches an answer, a miss included", async () => {
    const { searchTitle } = await import("./search");
    mockFetch.mockResolvedValue(reply({ results: [] }));
    await searchTitle("tv", "Nothing Here", undefined, KEY);
    await searchTitle("tv", "nothing here", undefined, KEY);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects on a network failure without caching it", async () => {
    const { searchTitle } = await import("./search");
    mockFetch.mockResolvedValueOnce(reply({}, 503));
    await expect(searchTitle("tv", "Flaky", undefined, KEY)).rejects.toMatchObject({ status: 503 });
    mockFetch.mockResolvedValueOnce(reply({ results: [{ name: "Flaky", poster_path: "/f.jpg" }] }));
    expect(await searchTitle("tv", "Flaky", undefined, KEY)).toEqual({ poster: "/f.jpg" });
  });
});
