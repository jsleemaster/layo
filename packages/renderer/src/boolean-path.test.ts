import { describe, expect, test } from "vitest";
import { evaluateBooleanPath } from "./boolean-path";

const base = {
  pathData: "M0 0 H100 V100 H0 Z",
  transform: { x: 0, y: 0, rotation: 0 }
};
const overlap = {
  pathData: "M0 0 H100 V100 H0 Z",
  transform: { x: 50, y: 0, rotation: 0 }
};

describe("boolean path evaluation", () => {
  test.each([
    ["union", 15_000, { x: 0, y: 0, width: 150, height: 100 }],
    ["difference", 5_000, { x: 0, y: 0, width: 50, height: 100 }],
    ["intersection", 5_000, { x: 50, y: 0, width: 50, height: 100 }],
    ["exclusion", 10_000, { x: 0, y: 0, width: 150, height: 100 }]
  ] as const)("evaluates %s without destroying source geometry", (operation, area, bounds) => {
    const result = evaluateBooleanPath(operation, [base, overlap]);

    expect(result.pathData).toMatch(/^M/);
    expect(Math.abs(result.area)).toBeCloseTo(area, 3);
    expect(result.bounds).toEqual(bounds);
  });

  test("preserves curved geometry instead of flattening it to polygon-only output", () => {
    const result = evaluateBooleanPath("union", [
      {
        pathData: "M50 0 C77.614 0 100 22.386 100 50 C100 77.614 77.614 100 50 100 C22.386 100 0 77.614 0 50 C0 22.386 22.386 0 50 0 Z",
        transform: { x: 0, y: 0, rotation: 0 }
      },
      {
        pathData: "M0 0 H40 V40 H0 Z",
        transform: { x: 80, y: 30, rotation: 0 }
      }
    ]);

    expect(result.pathData).toMatch(/[Cc]/);
    expect(result.bounds.width).toBe(120);
    expect(result.area).toBeGreaterThan(7_800);
  });
});
