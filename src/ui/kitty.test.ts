import { describe, it, expect } from "vitest";
import {
  deleteCommand,
  imageColor,
  newImageId,
  placeholderRows,
  posterMode,
  toRgb,
  uploadCommands,
  MAX_PLACEHOLDER,
} from "./kitty";
import type { Pixels } from "../tmdb/poster";

const TRUE = { COLORTERM: "truecolor" };

describe("posterMode", () => {
  it("draws images in Ghostty and Kitty with true colour", () => {
    expect(posterMode({ ...TRUE, TERM_PROGRAM: "ghostty" })).toBe("kitty");
    expect(posterMode({ ...TRUE, TERM: "xterm-ghostty" })).toBe("kitty");
    expect(posterMode({ ...TRUE, TERM: "xterm-kitty" })).toBe("kitty");
    expect(posterMode({ COLORTERM: "24bit", KITTY_WINDOW_ID: "1" })).toBe("kitty");
  });

  it("uses blocks in a terminal it does not recognise", () => {
    expect(posterMode({ ...TRUE, TERM_PROGRAM: "Apple_Terminal" })).toBe("blocks");
    expect(posterMode({ ...TRUE, TERM_PROGRAM: "iTerm.app" })).toBe("blocks");
    expect(posterMode({})).toBe("blocks");
  });

  it("needs true colour, because the placeholders name their image in a 24-bit colour", () => {
    expect(posterMode({ TERM_PROGRAM: "ghostty" })).toBe("blocks");
    expect(posterMode({ TERM_PROGRAM: "ghostty", COLORTERM: "256color" })).toBe("blocks");
  });

  it("uses blocks inside tmux or screen, which do not pass the protocol through", () => {
    expect(posterMode({ ...TRUE, TERM_PROGRAM: "ghostty", TMUX: "/tmp/tmux-1/default,1,0" })).toBe("blocks");
    expect(posterMode({ ...TRUE, TERM_PROGRAM: "ghostty", STY: "123.pts" })).toBe("blocks");
  });

  it("can be forced either way with TORLINK_POSTER_MODE, still needing true colour", () => {
    expect(posterMode({ ...TRUE, TERM_PROGRAM: "ghostty", TORLINK_POSTER_MODE: "blocks" })).toBe("blocks");
    expect(posterMode({ ...TRUE, TORLINK_POSTER_MODE: "kitty" })).toBe("kitty");
    expect(posterMode({ TORLINK_POSTER_MODE: "kitty" })).toBe("blocks");
  });
});

function pixels(width: number, height: number, color: [number, number, number]): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4);
  return { width, height, data };
}

describe("toRgb", () => {
  it("drops alpha, keeping three bytes a pixel", () => {
    const rgb = toRgb(pixels(2, 2, [10, 20, 30]));
    expect(rgb).toMatchObject({ width: 2, height: 2 });
    expect(Array.from(rgb.data.slice(0, 6))).toEqual([10, 20, 30, 10, 20, 30]);
  });

  it("averages a wide image down to the upload width, keeping its shape", () => {
    const rgb = toRgb(pixels(512, 768, [100, 150, 200]), 256);
    expect(rgb).toMatchObject({ width: 256, height: 384 });
    expect(Array.from(rgb.data.slice(0, 3))).toEqual([100, 150, 200]);
  });

  it("never upscales", () => {
    expect(toRgb(pixels(100, 150, [0, 0, 0]), 256)).toMatchObject({ width: 100, height: 150 });
  });
});

describe("uploadCommands", () => {
  const ESC = "\u001b";

  it("sends a small image as one command that uploads and places it, with no reply wanted", () => {
    const [cmd, ...rest] = uploadCommands(0x5a0001, pixels(2, 2, [1, 2, 3]), 16, 12);
    expect(rest).toHaveLength(0);
    expect(cmd!.startsWith(`${ESC}_Ga=T,U=1,f=24,i=${0x5a0001},s=2,v=2,c=16,r=12,q=2,m=0;`)).toBe(true);
    expect(cmd!.endsWith(`${ESC}\\`)).toBe(true);
    const payload = cmd!.slice(cmd!.indexOf(";") + 1, -2);
    expect(Buffer.from(payload, "base64")).toHaveLength(2 * 2 * 3);
  });

  it("splits a big image into chunks of at most 4096, flagging all but the last as more to come", () => {
    const cmds = uploadCommands(1, pixels(100, 150, [9, 9, 9]), 16, 12);
    expect(cmds.length).toBeGreaterThan(1);
    cmds.forEach((c, i) => {
      const last = i === cmds.length - 1;
      const keys = c.slice(`${ESC}_G`.length, c.indexOf(";"));
      expect(keys.endsWith(`m=${last ? 0 : 1}`)).toBe(true);
      if (i > 0) expect(keys).toBe(`m=${last ? 0 : 1}`);
      const payload = c.slice(c.indexOf(";") + 1, -2);
      expect(payload.length).toBeLessThanOrEqual(4096);
      if (!last) expect(payload.length).toBe(4096);
    });
    // Reassembled, the chunks are exactly the image.
    const joined = cmds.map((c) => c.slice(c.indexOf(";") + 1, -2)).join("");
    expect(Buffer.from(joined, "base64")).toHaveLength(100 * 150 * 3);
  });

  it("frees an image and its data with a delete", () => {
    expect(deleteCommand(0x5a0001)).toBe(`${ESC}_Ga=d,d=I,i=${0x5a0001},q=2${ESC}\\`);
  });
});

describe("placeholders", () => {
  it("makes rows x cols cells, each a placeholder carrying its own row and column", () => {
    const lines = placeholderRows(2, 3);
    expect(lines).toHaveLength(2);
    // Row 0 is U+0305, row 1 is U+030D; columns 0, 1, 2 are U+0305, U+030D, U+030E.
    expect(lines[0]).toBe("\u{10EEEE}̅̅\u{10EEEE}̅̍\u{10EEEE}̅̎");
    expect(lines[1]).toBe("\u{10EEEE}̍̅\u{10EEEE}̍̍\u{10EEEE}̍̎");
  });

  it("can number the largest poster there is, 32 rows by 43 columns", () => {
    expect(MAX_PLACEHOLDER).toBeGreaterThanOrEqual(43);
    expect(placeholderRows(32, 43)).toHaveLength(32);
  });

  it("names its image in the colour, a 24-bit id as a hex colour", () => {
    expect(imageColor(0x5a0001)).toBe("#5a0001");
    expect(imageColor(0x000102)).toBe("#000102");
  });

  it("hands out distinct image ids that fit 24 bits", () => {
    const a = newImageId();
    const b = newImageId();
    expect(a).not.toBe(b);
    expect(a).toBeLessThanOrEqual(0xffffff);
  });
});
