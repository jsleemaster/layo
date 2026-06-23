import { describe, expect, test } from "vitest";
import { calculateImageDrawConfig } from "./image-fit";

describe("image fit rendering", () => {
  test("fits wide images inside square nodes without cropping", () => {
    expect(
      calculateImageDrawConfig({
        mode: "fit",
        nodeWidth: 300,
        nodeHeight: 300,
        naturalWidth: 900,
        naturalHeight: 300
      })
    ).toEqual({
      x: 0,
      y: 100,
      width: 300,
      height: 100
    });
  });

  test("fills square nodes by cropping wide images from the center", () => {
    expect(
      calculateImageDrawConfig({
        mode: "fill",
        nodeWidth: 300,
        nodeHeight: 300,
        naturalWidth: 900,
        naturalHeight: 300
      })
    ).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      crop: {
        x: 300,
        y: 0,
        width: 300,
        height: 300
      }
    });
  });
});
