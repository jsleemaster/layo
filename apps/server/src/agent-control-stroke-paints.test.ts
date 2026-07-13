import { describe, expect, test } from "vitest";
import type { DesignNode, NodeStroke } from "./storage";
import { normalizeAgentNodeStyle } from "./agent-control-base";

const baseStyle: DesignNode["style"] = {
  fill: "#ffffff",
  stroke: "#111827",
  stroke_width: 2,
  opacity: 1
};

const baseStroke = {
  id: "painted",
  color: "#111827",
  opacity: 0.8,
  width: 8,
  position: "outside",
  style: "solid",
  visible: true,
  dasharray: [],
  cap: "round",
  join: "round",
  start_marker: "none",
  end_marker: "none"
} satisfies NodeStroke;

describe("first-class stroke paint contract", () => {
  test("preserves an owned gradient paint on its ordered stroke", () => {
    const paintedStroke = {
      ...baseStroke,
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
      }
    } as unknown as NodeStroke;

    const normalized = normalizeAgentNodeStyle({ ...baseStyle, strokes: [paintedStroke] });
    expect(normalized.strokes?.[0]).toMatchObject({
      id: "painted",
      position: "outside",
      opacity: 0.8,
      paint: {
        type: "gradient",
        gradient: {
          type: "linear",
          stops: [
            { color: "#ef4444", opacity: 1, offset: 0 },
            { color: "#2563eb", opacity: 0.7, offset: 1 }
          ]
        }
      }
    });
  });

  test("preserves image asset ownership and rejects malformed paints", () => {
    const imageStroke = {
      ...baseStroke,
      id: "image",
      paint: { type: "image", asset_id: "asset-border-texture" }
    } as unknown as NodeStroke;
    expect(normalizeAgentNodeStyle({ ...baseStyle, strokes: [imageStroke] }).strokes?.[0]).toMatchObject({
      id: "image",
      paint: { type: "image", asset_id: "asset-border-texture" }
    });

    const emptyImage = {
      ...baseStroke,
      id: "empty-image",
      paint: { type: "image", asset_id: "" }
    } as unknown as NodeStroke;
    expect(() => normalizeAgentNodeStyle({ ...baseStyle, strokes: [emptyImage] })).toThrow(
      "strokes[0].paint.asset_id must be non-empty"
    );

    const missingSolidColor = {
      ...baseStroke,
      id: "missing-solid-color",
      paint: { type: "solid" }
    } as unknown as NodeStroke;
    expect(() => normalizeAgentNodeStyle({ ...baseStyle, strokes: [missingSolidColor] })).toThrow(
      "strokes[0].paint.color is required"
    );

    const invalidGradient = {
      ...baseStroke,
      id: "invalid-gradient",
      paint: {
        type: "gradient",
        gradient: {
          type: "linear",
          stops: [{ color: "#ef4444", opacity: 1, offset: 0 }]
        }
      }
    } as unknown as NodeStroke;
    expect(() => normalizeAgentNodeStyle({ ...baseStyle, strokes: [invalidGradient] })).toThrow(
      "strokes[0].paint.gradient requires at least two stops"
    );
  });
});
