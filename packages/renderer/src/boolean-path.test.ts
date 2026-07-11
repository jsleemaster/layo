import { describe, expect, test } from "vitest";
import { evaluateBooleanPath, flattenPathGeometry } from "./boolean-path";

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
    expect(result.fillRule).toBe("nonzero");
    expect(Math.abs(result.area)).toBeCloseTo(area, 3);
    expect(result.bounds).toEqual(bounds);
  });

  test("honors even-odd holes before normalizing the result fill rule", () => {
    const result = evaluateBooleanPath("union", [
      {
        pathData: "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z",
        fillRule: "evenodd",
        transform: { x: 0, y: 0, rotation: 0 }
      },
      {
        pathData: "M0 0 H10 V10 H0 Z",
        transform: { x: 200, y: 0, rotation: 0 }
      }
    ]);

    expect(result.area).toBeCloseTo(7_600, 3);
    expect(result.fillRule).toBe("nonzero");
  });

  test("rejects unknown runtime operations instead of treating them as exclusion", () => {
    expect(() => evaluateBooleanPath("invalid" as never, [base, overlap])).toThrow(
      "unsupported boolean path operation"
    );
  });

  test("rejects open operands instead of guessing their fill geometry", () => {
    expect(() =>
      evaluateBooleanPath("union", [
        {
          pathData: "M0 0 H100 V100",
          transform: { x: 0, y: 0, rotation: 0 }
        },
        overlap
      ])
    ).toThrow("closed geometry");
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


describe("path flattening", () => {
  test("normalizes one closed path into standalone local geometry", () => {
    const result = flattenPathGeometry([
      {
        pathData: "M0 0 H100 V100 H0 Z",
        transform: { x: 40, y: 25, rotation: 0 }
      }
    ]);

    expect(result.pathData).toMatch(/^M/);
    expect(result.bounds).toEqual({ x: 40, y: 25, width: 100, height: 100 });
    expect(result.fillRule).toBe("nonzero");
    expect(result.area).toBeCloseTo(10_000, 3);
  });

  test("preserves curves, even-odd holes, and rotated world bounds", () => {
    const result = flattenPathGeometry([
      {
        pathData:
          "M50 0 C77.614 0 100 11.193 100 25 C100 38.807 77.614 50 50 50 C22.386 50 0 38.807 0 25 C0 11.193 22.386 0 50 0 Z M35 15 H65 V35 H35 Z",
        fillRule: "evenodd",
        transform: { x: 120, y: 80, rotation: 45 }
      }
    ]);

    expect(result.pathData).toMatch(/[Cc]/);
    expect(result.fillRule).toBe("nonzero");
    expect(result.bounds.width).toBeCloseTo(106.066, 3);
    expect(result.bounds.height).toBeCloseTo(106.066, 3);
    expect(result.area).toBeGreaterThan(3_000);
  });

  test("keeps multiple closed sources as one compound standalone path", () => {
    const result = flattenPathGeometry([base, overlap]);

    expect(result.pathData.match(/[Mm]/g)).toHaveLength(2);
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 150, height: 100 });
    expect(result.area).toBeCloseTo(20_000, 3);
  });

  test("rejects open source geometry before destructive replacement", () => {
    expect(() =>
      flattenPathGeometry([
        {
          pathData: "M0 0 H100 V100",
          transform: { x: 0, y: 0, rotation: 0 }
        }
      ])
    ).toThrow("closed geometry");
  });
});
