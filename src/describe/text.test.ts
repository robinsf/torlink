import { describe, it, expect } from "vitest";
import { htmlToText } from "./text";

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p><b>Walt</b> &amp; Jesse&#39;s <i>plan</i>&nbsp;fails.</p>")).toBe(
      "Walt & Jesse's plan fails.",
    );
  });
  it("keeps words apart across line breaks and tags", () => {
    expect(htmlToText("one<br>two\nthree")).toBe("one two three");
  });
  it("never lets a control or escape character through, including via an entity", () => {
    expect(htmlToText("a\u001b]52;c;x\u0007b &#27;[31mred")).toBe("a]52;c;xb [31mred");
  });
  it("leaves an unknown entity as written", () => {
    expect(htmlToText("fish &chips; &#x110000;")).toBe("fish &chips;");
  });
});
