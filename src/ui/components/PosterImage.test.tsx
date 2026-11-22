import { afterEach, describe, expect, it, vi } from "vitest";
import { renderUI, type RenderedUI } from "../testHarness";
import { Poster } from "./Poster";
import type { Pixels } from "../../tmdb/poster";

const IMG: Pixels = { width: 8, height: 12, data: new Uint8Array(8 * 12 * 4).fill(200) };
const ESC = "\u001b";

let ui: RenderedUI | null = null;
afterEach(() => {
  ui?.unmount();
  ui = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function spyOnTerminal(): string[] {
  const written: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  return written;
}

describe("Poster as an inline image", () => {
  it("uploads the image, draws placeholders instead of blocks, and frees it on unmount", async () => {
    vi.stubEnv("TORLINK_POSTER_MODE", "kitty");
    vi.stubEnv("COLORTERM", "truecolor");
    const written = spyOnTerminal();
    ui = renderUI(<Poster img={IMG} cols={16} rows={12} />);
    const u = ui;
    await vi.waitFor(() => expect(u.frame()).toContain("\u{10EEEE}"));
    expect(u.frame()).not.toContain("▀");
    expect(u.frame().split("\n").filter((l) => l.includes("\u{10EEEE}"))).toHaveLength(12);

    const upload = written.find((w) => w.startsWith(`${ESC}_Ga=T,U=1,f=24,`));
    expect(upload).toBeDefined();
    expect(upload).toContain("c=16,r=12,q=2");
    const id = /i=(\d+)/.exec(upload!)![1]!;

    u.unmount();
    ui = null;
    expect(written).toContain(`${ESC}_Ga=d,d=I,i=${id},q=2${ESC}\\`);
  });

  it("draws blocks and writes nothing to the terminal when images are off", async () => {
    vi.stubEnv("TORLINK_POSTER_MODE", "blocks");
    const written = spyOnTerminal();
    ui = renderUI(<Poster img={IMG} cols={16} rows={12} />);
    const u = ui;
    await vi.waitFor(() => expect(u.frame()).toMatch(/[▀▌▚▘▝▖▗]/));
    expect(u.frame()).not.toContain("\u{10EEEE}");
    expect(written.some((w) => w.includes(`${ESC}_G`))).toBe(false);
  });

  it("holds an empty spot, and uploads nothing, until the image has loaded", async () => {
    vi.stubEnv("TORLINK_POSTER_MODE", "kitty");
    vi.stubEnv("COLORTERM", "truecolor");
    const written = spyOnTerminal();
    ui = renderUI(<Poster img={null} cols={16} rows={12} />);
    const u = ui;
    await vi.waitFor(() => expect(u.frame()).toBeDefined());
    expect(u.frame()).not.toContain("\u{10EEEE}");
    expect(written.some((w) => w.includes(`${ESC}_G`))).toBe(false);
  });
});
