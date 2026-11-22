import { describe, it, expect, vi, beforeEach } from "vitest";
import jpeg from "jpeg-js";
import { fetchResilient } from "../util/net";

vi.mock("../util/net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/net")>();
  return { ...actual, fetchResilient: vi.fn() };
});

const mockFetch = vi.mocked(fetchResilient);

// A real JPEG: red above, blue below.
function sampleJpeg(width = 16, height = 24): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const top = y < height / 2;
      data.set(top ? [255, 0, 0, 255] : [0, 0, 255, 255], i);
    }
  }
  return new Uint8Array(jpeg.encode({ width, height, data }, 95).data);
}

const bytesReply = (bytes: Uint8Array, status = 200): Response =>
  ({
    ok: status < 400,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }) as unknown as Response;

beforeEach(() => {
  mockFetch.mockReset();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("fetchPoster", () => {
  it("downloads from TMDB's image host and decodes to RGBA", async () => {
    const { fetchPoster } = await import("./poster");
    mockFetch.mockResolvedValueOnce(bytesReply(sampleJpeg()));
    const img = await fetchPoster("/abc123.jpg");
    expect(String(mockFetch.mock.calls[0]![0])).toBe("https://image.tmdb.org/t/p/w342/abc123.jpg");
    expect(img).toMatchObject({ width: 16, height: 24 });
    expect(img!.data).toHaveLength(16 * 24 * 4);
    // Top of the image is red, bottom blue (JPEG is lossy, so approximately).
    expect(img!.data[0]).toBeGreaterThan(200);
    expect(img!.data[(23 * 16) * 4 + 2]).toBeGreaterThan(200);
  });

  it("refuses any path that is not a TMDB poster path, without a request", async () => {
    const { fetchPoster } = await import("./poster");
    for (const path of ["https://evil.example/x.jpg", "/../secret.jpg", "/a/b.jpg", "/x.png", "", "/x.jpg?y=1"]) {
      expect(await fetchPoster(path)).toBeNull();
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null for bytes that are not a JPEG, or too many of them", async () => {
    const { fetchPoster } = await import("./poster");
    mockFetch.mockResolvedValueOnce(bytesReply(new Uint8Array([1, 2, 3, 4])));
    expect(await fetchPoster("/junk.jpg")).toBeNull();
    mockFetch.mockResolvedValueOnce(bytesReply(new Uint8Array(600 * 1024)));
    expect(await fetchPoster("/huge.jpg")).toBeNull();
  });

  it("throws on an HTTP failure and caches a good poster", async () => {
    const { fetchPoster } = await import("./poster");
    mockFetch.mockResolvedValueOnce(bytesReply(new Uint8Array(), 404));
    await expect(fetchPoster("/gone.jpg")).rejects.toMatchObject({ status: 404 });
    mockFetch.mockResolvedValueOnce(bytesReply(sampleJpeg()));
    await fetchPoster("/ok.jpg");
    await fetchPoster("/ok.jpg");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("is off when TORLINK_NO_POSTERS is set", async () => {
    const { postersEnabled } = await import("./poster");
    expect(postersEnabled({})).toBe(true);
    expect(postersEnabled({ TORLINK_NO_POSTERS: "1" })).toBe(false);
  });
});

describe("isPosterUrl", () => {
  it.each([
    "https://image.tmdb.org/t/p/w342/abc.jpg",
    "https://static.tvmaze.com/uploads/images/medium_portrait/528/1320416.jpg",
    "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Dune_%282021_film%29.jpg/330px-Dune_%282021_film%29.jpg",
  ])("accepts %s", async (url) => {
    const { isPosterUrl } = await import("./poster");
    expect(isPosterUrl(url)).toBe(true);
  });

  it.each([
    "http://static.tvmaze.com/uploads/images/medium_portrait/528/1.jpg",
    "https://evil.example/x.jpg",
    "https://static.tvmaze.com.evil.example/x.jpg",
    "https://user:pw@static.tvmaze.com/x.jpg",
    "https://static.tvmaze.com:8443/x.jpg",
    "https://static.tvmaze.com/x.jpg?redirect=1",
    "https://static.tvmaze.com/x.jpg#frag",
    "https://static.tvmaze.com/x.svg",
    "https://static.tvmaze.com/x.png",
    "not a url",
    "",
  ])("refuses %j", async (url) => {
    const { isPosterUrl } = await import("./poster");
    expect(isPosterUrl(url)).toBe(false);
  });
});

describe("fetchPosterFrom", () => {
  it("fetches a vetted URL as is, refusing redirects, and decodes it", async () => {
    const { fetchPosterFrom } = await import("./poster");
    mockFetch.mockResolvedValueOnce(bytesReply(sampleJpeg()));
    const img = await fetchPosterFrom({ url: "https://static.tvmaze.com/uploads/images/medium_portrait/1/2.jpg" });
    expect(img).toMatchObject({ width: 16, height: 24 });
    expect(String(mockFetch.mock.calls[0]![0])).toBe("https://static.tvmaze.com/uploads/images/medium_portrait/1/2.jpg");
    expect((mockFetch.mock.calls[0]![1] as RequestInit).redirect).toBe("error");
  });

  it("makes no request for a URL off the allowed hosts", async () => {
    const { fetchPosterFrom } = await import("./poster");
    expect(await fetchPosterFrom({ url: "https://evil.example/x.jpg" })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches a TMDB source through the poster path check", async () => {
    const { fetchPosterFrom } = await import("./poster");
    mockFetch.mockResolvedValueOnce(bytesReply(sampleJpeg()));
    expect(await fetchPosterFrom({ tmdb: "/ok.jpg" })).not.toBeNull();
    expect(await fetchPosterFrom({ tmdb: "/../x.jpg" })).toBeNull();
  });
});
