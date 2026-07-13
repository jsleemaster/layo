import { describe, expect, test } from "vitest";
import type { DesignNode } from "./storage";
import { normalizeAgentNodeStyle } from "./agent-control-base";

const baseStyle: DesignNode["style"] = {
  fill: "#ffffff",
  stroke: "#111827",
  stroke_width: 2,
  opacity: 1
};

describe("first-class multi-stroke agent contract", () => {
  test("preserves ordered strokes through deterministic normalization", () => {
    const style = normalizeAgentNodeStyle({
      ...baseStyle,
      strokes: [
        {
          id: "outside",
          color: "#ef4444",
          opacity: 0.4,
          width: 8,
          position: "outside",
          style: "dashed",
          visible: true,
          dasharray: [8, 4],
          cap: "round",
          join: "round",
          start_marker: "circle",
          end_marker: "diamond"
        },
        {
          id: "inside",
          color: "#2563eb",
          opacity: 1,
          width: 2,
          position: "inside",
          style: "solid",
          visible: false,
          dasharray: [],
          cap: "butt",
          join: "miter",
          start_marker: "none",
          end_marker: "none"
        }
      ]
    });

    expect(style.strokes?.map((stroke) => stroke.id)).toEqual(["outside", "inside"]);
    expect(style.strokes?.[0]).toMatchObject({
      opacity: 0.4,
      position: "outside",
      dasharray: [8, 4],
      start_marker: "circle",
      end_marker: "diamond"
    });
    expect(style.strokes?.[1].visible).toBe(false);
  });

  test("rejects duplicate ids and invalid per-stroke values without mutating input", () => {
    const duplicate = {
      id: "same",
      color: "#111827",
      opacity: 1,
      width: 2,
      position: "center" as const,
      style: "solid" as const,
      visible: true,
      dasharray: [],
      cap: "butt" as const,
      join: "miter" as const,
      start_marker: "none" as const,
      end_marker: "none" as const
    };

    expect(() => normalizeAgentNodeStyle({ ...baseStyle, strokes: [duplicate, duplicate] })).toThrow(
      "strokes[1].id must be non-empty and unique"
    );
    expect(() =>
      normalizeAgentNodeStyle({ ...baseStyle, strokes: [{ ...duplicate, id: "opacity", opacity: 2 }] })
    ).toThrow("strokes[0].opacity must be between 0 and 1");
    expect(() =>
      normalizeAgentNodeStyle({ ...baseStyle, strokes: [{ ...duplicate, id: "dash", dasharray: [0, 0] }] })
    ).toThrow("strokes[0].dasharray is invalid");
  });
});
