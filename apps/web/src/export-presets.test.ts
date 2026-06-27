import { describe, expect, test } from "vitest";
import type { RendererNode } from "@layo/renderer";
import { buildExportPresetReviewItems } from "./export-presets";

const baseNode: RendererNode = {
  id: "node",
  kind: "text",
  name: "Node",
  children: [],
  transform: { x: 0, y: 0, rotation: 0 },
  size: { width: 100, height: 40 },
  style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
  content: { type: "text", value: "Node", font_size: 18, font_family: "Inter" }
};

describe("export preset review items", () => {
  test("builds stable artifact rows for selected nodes", () => {
    const items = buildExportPresetReviewItems([
      {
        ...baseNode,
        id: "text-1",
        name: "헤드라인",
        export_presets: [
          { id: "preset-png", format: "png", scale: 3, suffix: "@hero" },
          { id: "preset-svg", format: "svg", scale: 1, suffix: "" }
        ]
      },
      {
        ...baseNode,
        id: "image-1",
        kind: "image",
        name: "썸네일",
        content: { type: "image", asset_id: "asset-1", fit_mode: "fill" },
        export_presets: [{ id: "preset-jpeg", format: "jpeg", scale: 2, suffix: "@thumb" }]
      }
    ]);

    expect(items).toEqual([
      {
        key: "text-1:preset-png",
        nodeId: "text-1",
        nodeName: "헤드라인",
        presetId: "preset-png",
        format: "png",
        scale: 3,
        suffix: "@hero",
        filename: "text-1@hero.png",
        label: "헤드라인 PNG 3x"
      },
      {
        key: "text-1:preset-svg",
        nodeId: "text-1",
        nodeName: "헤드라인",
        presetId: "preset-svg",
        format: "svg",
        scale: 1,
        suffix: "",
        filename: "text-1.svg",
        label: "헤드라인 SVG 1x"
      },
      {
        key: "image-1:preset-jpeg",
        nodeId: "image-1",
        nodeName: "썸네일",
        presetId: "preset-jpeg",
        format: "jpeg",
        scale: 2,
        suffix: "@thumb",
        filename: "image-1@thumb.jpg",
        label: "썸네일 JPEG 2x"
      }
    ]);
  });
});
