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
    expect(String(mockFetch.mock.calls[0]![0])).toBe("https://image.tmdb.org/t/p/w154/abc123.jpg");
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
