import type { Pixels } from "../tmdb/poster";

// Inline images through the Kitty graphics protocol, as Ghostty and Kitty speak
// it. The image is uploaded once and given a "virtual placement"; it is then
// drawn by printing placeholder characters in ordinary text cells, each
// carrying its row and column as combining marks and the image's id as its
// colour. Because that is plain text, the UI library lays it out and redraws it
// like any other text, with no cursor positioning to keep in step.

export type PosterMode = "kitty" | "blocks";

// Which way to draw a poster. Inline images only on terminals known to speak
// the protocol (Kitty and Ghostty), and only with true colour, since the
// placeholders name their image in a 24-bit colour that a 256-colour terminal
// would round to a different image. A multiplexer does not pass the protocol
// through. TORLINK_POSTER_MODE=blocks forces the block-character poster, and
// =kitty forces images on a terminal this does not recognise.
export function posterMode(env: NodeJS.ProcessEnv = process.env): PosterMode {
  const forced = env.TORLINK_POSTER_MODE?.trim().toLowerCase();
  if (forced === "blocks") return "blocks";
  if (!/truecolor|24bit/i.test(env.COLORTERM ?? "")) return "blocks";
  if (forced === "kitty") return "kitty";
  if (env.TMUX || env.STY) return "blocks";
  const known =
    env.TERM_PROGRAM === "ghostty" ||
    env.TERM === "xterm-ghostty" ||
    env.TERM === "xterm-kitty" ||
    !!env.KITTY_WINDOW_ID;
  return known ? "kitty" : "blocks";
}

// Combining marks that stand for the numbers 0, 1, 2... in a placeholder's row
// and column, the first 64 of the 297 in kitty's rowcolumn-diacritics.txt. A
// poster is at most 32 rows and 43 columns.
const DIACRITICS = [
  0x0305, 0x030D, 0x030E, 0x0310, 0x0312, 0x033D, 0x033E, 0x033F,
  0x0346, 0x034A, 0x034B, 0x034C, 0x0350, 0x0351, 0x0352, 0x0357,
  0x035B, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369,
  0x036A, 0x036B, 0x036C, 0x036D, 0x036E, 0x036F, 0x0483, 0x0484,
  0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597,
  0x0598, 0x0599, 0x059C, 0x059D, 0x059E, 0x059F, 0x05A0, 0x05A1,
  0x05A8, 0x05A9, 0x05AB, 0x05AC, 0x05AF, 0x05C4, 0x0610, 0x0611,
  0x0612, 0x0613, 0x0614, 0x0615, 0x0616, 0x0617, 0x0657, 0x0658,
];

const PLACEHOLDER = "\u{10EEEE}";
const ESC = "\u001b";
const CHUNK = 4096;

// The most pixels across an uploaded poster. The terminal scales it to the
// cells it covers, which is rarely wider than this, and a smaller upload is
// quicker to send.
const MAX_UPLOAD_WIDTH = 256;

// A copy of the image averaged down to at most `maxWidth` pixels across, as
// RGB (three bytes a pixel, no alpha): the format the upload sends.
export function toRgb(img: Pixels, maxWidth: number = MAX_UPLOAD_WIDTH): { width: number; height: number; data: Uint8Array } {
  const scale = Math.min(1, maxWidth / img.width);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * img.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * img.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < Math.min(y1, img.height); sy++) {
        for (let sx = x0; sx < Math.min(x1, img.width); sx++) {
          const i = (sy * img.width + sx) * 4;
          r += img.data[i]!;
          g += img.data[i + 1]!;
          b += img.data[i + 2]!;
          n++;
        }
      }
      const o = (y * width + x) * 3;
      data[o] = n ? r / n : 0;
      data[o + 1] = n ? g / n : 0;
      data[o + 2] = n ? b / n : 0;
    }
  }
  return { width, height, data };
}

// The escape sequences that upload an image and create its virtual placement
// over `cols` x `rows` cells, in the chunks the protocol requires. q=2 asks
// the terminal not to answer: a reply would arrive on stdin as keystrokes.
export function uploadCommands(id: number, img: Pixels, cols: number, rows: number): string[] {
  const rgb = toRgb(img);
  const b64 = Buffer.from(rgb.data).toString("base64");
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) {
    const more = i + CHUNK < b64.length ? 1 : 0;
    const keys =
      i === 0
        ? `a=T,U=1,f=24,i=${id},s=${rgb.width},v=${rgb.height},c=${cols},r=${rows},q=2,m=${more}`
        : `m=${more}`;
    out.push(`${ESC}_G${keys};${b64.slice(i, i + CHUNK)}${ESC}\\`);
  }
  return out;
}

// Frees an uploaded image and its data in the terminal.
export function deleteCommand(id: number): string {
  return `${ESC}_Ga=d,d=I,i=${id},q=2${ESC}\\`;
}

// An id for each upload, as a 24-bit number so it fits the placeholder colour.
let nextId = 0x5a0000;
export function newImageId(): number {
  nextId = nextId >= 0xfffff0 ? 0x5a0000 : nextId + 1;
  return nextId;
}

export const imageColor = (id: number): string =>
  `#${(id & 0xffffff).toString(16).padStart(6, "0")}`;

// The placeholder text for each row of the image. Every cell carries its own
// row and column, so nothing depends on the terminal inferring them.
export function placeholderRows(rows: number, cols: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      line += PLACEHOLDER + String.fromCodePoint(DIACRITICS[r]!) + String.fromCodePoint(DIACRITICS[c]!);
    }
    out.push(line);
  }
  return out;
}

// How many rows and columns the placeholder table can number.
export const MAX_PLACEHOLDER = DIACRITICS.length;
