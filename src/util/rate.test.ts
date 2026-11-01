import { describe, it, expect } from "vitest";
import { parseRate } from "./rate";

describe("parseRate", () => {
  it.each([
    ["500", 500],
    ["500k", 512_000],
    ["2m", 2 * 1024 ** 2],
    ["1.5MB/s", 1.5 * 1024 ** 2],
    ["  750 KiB ", 750 * 1024],
    ["1g", 1024 ** 3],
  ])("reads %j as bytes per second", (input, expected) => {
    expect(parseRate(input)).toBe(expected);
  });
  it("reads 0, off and unlimited as no limit", () => {
    expect(parseRate("0")).toBe(0);
    expect(parseRate("off")).toBe(0);
    expect(parseRate("Unlimited")).toBe(0);
  });
  it.each(["", "fast", "-5k", "5x", "k"])("rejects %j", (input) => {
    expect(parseRate(input)).toBeNull();
  });
});
