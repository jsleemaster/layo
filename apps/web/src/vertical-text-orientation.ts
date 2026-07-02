import type { TextOrientation } from "@layo/renderer";

const HORIZONTAL_SCRIPT_RE = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Hebrew}\p{Script=Arabic}]/u;
const UPRIGHT_VERTICAL_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u;
const NUMBER_OR_SYMBOL_RE = /[\p{Number}\p{Symbol}]/u;
const ASCII_PRINTABLE_RE = /^[\u0021-\u007e]$/u;
const CJK_AND_FULLWIDTH_FORMS_RE = /^[\u3000-\u303f\ufe10-\ufe1f\ufe30-\ufe6f\uff00-\uffef]$/u;
const VERTICAL_WHITESPACE_RE = /^\s$/u;

export function isSidewaysVerticalCanvasGlyph(glyph: string, textOrientation: TextOrientation): boolean {
  if (textOrientation === "sideways") {
    return !isVerticalWhitespace(glyph);
  }
  if (textOrientation === "upright") {
    return false;
  }
  return isMixedSidewaysGlyph(glyph);
}

function isMixedSidewaysGlyph(glyph: string): boolean {
  if (isVerticalWhitespace(glyph) || isUprightVerticalGlyph(glyph)) {
    return false;
  }

  return HORIZONTAL_SCRIPT_RE.test(glyph) || NUMBER_OR_SYMBOL_RE.test(glyph) || ASCII_PRINTABLE_RE.test(glyph);
}

function isUprightVerticalGlyph(glyph: string): boolean {
  return UPRIGHT_VERTICAL_SCRIPT_RE.test(glyph) || CJK_AND_FULLWIDTH_FORMS_RE.test(glyph);
}

function isVerticalWhitespace(glyph: string): boolean {
  return VERTICAL_WHITESPACE_RE.test(glyph);
}
