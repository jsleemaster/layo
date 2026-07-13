import { describe, expect, test } from "vitest";
import type { DesignNode } from "./storage";
import { normalizeAgentNodeStyle } from "./agent-control-base";

const baseStyle: DesignNode["style"] = {
  fill: "#ffffff",
  stroke: null,
  stroke_width: 0,
  opacity: 1
};

const orderedFills = [
  {
    id: "solid",
    color: "#111827",
    paint: { type: "solid", color: "#111827" },
    opacity: 0.8,
    visible: true,
    blend_mode: "normal"
  },
  {
    id: "gradient",
    color: "#ef4444",
    paint: {
      type: "gradient",
      gradient: {
        type: "linear",
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
        stops: [
          { color: "#ef4444", opacity: 1, offset: 0 },
          { color: "#2563eb", opacity: 0.7, offset: 1 }
        ]
      }
    },
    opacity: 1,
    visible: true,
    blend_mode: "multiply"
  },
  {
    id: "image",
    color: "#ffffff",
    paint: { type: "image", asset_id: "asset-fill-texture" },
    opacity: 0.6,
    visible: true,
    blend_mode: "screen"
  }
];

describe("first-class fill paint contract", () => {
  test("preserves ordered solid, gradient, and image fill ownership", () => {
    const normalized = normalizeAgentNodeStyle({
      ...baseStyle,
      fills: orderedFills
    } as unknown as DesignNode["style"]) as DesignNode["style"] & { fills?: unknown[] };

    expect(normalized.fills).toEqual(orderedFills);
  });

  test("rejects malformed owned fill paints", () => {
    expect(() =>
      normalizeAgentNodeStyle({
        ...baseStyle,
        fills: [
          {
            ...orderedFills[2],
            paint: { type: "image", asset_id: "" }
          }
        ]
      } as unknown as DesignNode["style"])
    ).toThrow("fills[0].paint.asset_id must be non-empty");

    expect(() =>
      normalizeAgentNodeStyle({
        ...baseStyle,
        fills: [
          {
            ...orderedFills[1],
            paint: {
              type: "gradient",
              gradient: { type: "linear", stops: [{ color: "#ef4444", opacity: 1, offset: 0 }] }
            }
          }
        ]
      } as unknown as DesignNode["style"])
    ).toThrow("fills[0].paint.gradient requires at least two stops");
  });
});
