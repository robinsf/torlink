import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapKnabenResults, knaben } from "./knaben";
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
});

describe("mapKnabenResults", () => {
  it("maps an API row to a torrent result with a built magnet, tagged by source id", () => {
    const [r] = mapKnabenResults(
      [
        {
          hash: "DAFC8C076CA2F3ED376EEAE7C76A0D6BE2415C45",
          title: "Dune (2021) [1080p] [WEBRip]",
          bytes: 2952790016,
          seeders: 1153,
          peers: 67,
          date: "2026-04-25T15:35:00+00:00",
        },
      ],
      "knaben",
    );
    expect(r).toMatchObject({
      infoHash: "dafc8c076ca2f3ed376eeae7c76a0d6be2415c45",
      name: "Dune (2021) [1080p] [WEBRip]",
      sizeBytes: 2952790016,
      seeders: 1153,
      leechers: 67,
      source: "knaben",
    });
    expect(r!.magnet).toContain("xt=urn:btih:dafc8c076ca2f3ed376eeae7c76a0d6be2415c45");
    expect(r!.added).toBe(Math.floor(Date.parse("2026-04-25T15:35:00+00:00") / 1000));
  });

  it("defaults missing counts to 0 and drops rows without a usable info hash", () => {
    const out = mapKnabenResults(
      [
        { hash: "a".repeat(40), title: "x", seeders: null, peers: null },
        { hash: null, title: "no hash" },
        { hash: "not-a-hash", title: "bad hash" },
      ],
      "knaben",
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ seeders: 0, leechers: 0, sizeBytes: 0 });
  });
});

describe("knaben source", () => {
  it("posts one TV and Movies query sorted by seeders", async () => {
    mockFetch.mockResolvedValueOnce(reply({ hits: [{ hash: "b".repeat(40), title: "Dune", seeders: 5 }] }));
    const results = await knaben.search("  dune ");
    expect(results.map((r) => r.name)).toEqual(["Dune"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.knaben.org/v1");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: "dune",
      categories: [2_000_000, 3_000_000],
      order_by: "seeders",
      hide_unsafe: true,
    });
  });

  it("skips the request for a query too short to search", async () => {
    expect(await knaben.search("")).toEqual([]);
    expect(await knaben.search("ab")).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("treats a response with no hits as no results", async () => {
    mockFetch.mockResolvedValueOnce(reply({}));
    expect(await knaben.search("nothing here")).toEqual([]);
  });

  it("throws an HttpError carrying the status when the API fails", async () => {
    mockFetch.mockResolvedValueOnce(reply({}, 503));
    await expect(knaben.search("dune")).rejects.toMatchObject({ status: 503 });
  });
});
