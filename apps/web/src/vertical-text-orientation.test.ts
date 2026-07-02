import { describe, expect, test } from "vitest";
import { isSidewaysVerticalCanvasGlyph } from "./vertical-text-orientation";

describe("isSidewaysVerticalCanvasGlyph", () => {
  test("keeps explicit upright orientation upright for every glyph", () => {
    for (const glyph of ["A", "é", "Ω", "Ж", "漢", "한", "2", "€", "#"]) {
      expect(isSidewaysVerticalCanvasGlyph(glyph, "upright")).toBe(false);
    }
  });

  test("rotates every non-whitespace glyph for explicit sideways orientation", () => {
    for (const glyph of ["A", "é", "Ω", "Ж", "漢", "한", "2", "€", "#"]) {
      expect(isSidewaysVerticalCanvasGlyph(glyph, "sideways")).toBe(true);
    }
    expect(isSidewaysVerticalCanvasGlyph(" ", "sideways")).toBe(false);
    expect(isSidewaysVerticalCanvasGlyph("\t", "sideways")).toBe(false);
  });

  test("rotates horizontal scripts, digits, and symbols in mixed vertical text", () => {
    for (const glyph of ["A", "é", "Ω", "Ж", "א", "م", "2", "€", "#"]) {
      expect(isSidewaysVerticalCanvasGlyph(glyph, "mixed")).toBe(true);
    }
  });

  test("keeps CJK scripts and vertical punctuation upright in mixed vertical text", () => {
    for (const glyph of ["漢", "한", "あ", "ア", "ㄅ", "、", "。", "Ａ", "１"]) {
      expect(isSidewaysVerticalCanvasGlyph(glyph, "mixed")).toBe(false);
    }
  });

  test("keeps whitespace upright in mixed vertical text", () => {
    for (const glyph of [" ", "\t", "\n"]) {
      expect(isSidewaysVerticalCanvasGlyph(glyph, "mixed")).toBe(false);
    }
  });
});
