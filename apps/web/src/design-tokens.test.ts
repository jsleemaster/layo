import { describe, expect, test } from "vitest";
import { editorKonvaTokens, editorTokenNames } from "./design-tokens";

describe("design tokens", () => {
  test("exposes semantic token names for UI and Konva surfaces", () => {
    expect(editorTokenNames.colors).toContain("--editor-color-stage");
    expect(editorTokenNames.spacing).toContain("--editor-space-md");
    expect(editorTokenNames.radii).toContain("--editor-radius-md");
    expect(editorKonvaTokens.radius.frame).toBe(8);
  });
});
