import { describe, expect, test } from "vitest";
import type { DesignFile, DesignNode } from "./storage";
import { applyAgentCommandsToDocument, normalizeAgentNodeStyle } from "./agent-control-base";

const baseStyle: DesignNode["style"] = {
  fill: "#ffffff",
  stroke: null,
  stroke_width: 0,
  opacity: 1
};

const orderedFills: NonNullable<DesignNode["style"]["fills"]> = [
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


  test("serializes the ordered fill stack as a component instance override", () => {
    const document = {
      id: "fill-component-file",
      name: "Fill Component",
      pages: [{
        id: "page-1",
        name: "Page",
        children: [{
          id: "frame-1",
          kind: "frame",
          name: "Frame",
          transform: { x: 0, y: 0, rotation: 0 },
          size: { width: 800, height: 600 },
          style: baseStyle,
          content: { type: "empty" },
          children: []
        }]
      }]
    } as DesignFile;

    const result = applyAgentCommandsToDocument(document, [
      {
        type: "create_rectangle",
        parentId: "frame-1",
        id: "fill-source",
        name: "Fill Source",
        fill: "#ffffff"
      },
      {
        type: "create_component",
        nodeId: "fill-source",
        componentId: "fill-component",
        name: "Fill Component"
      },
      {
        type: "create_component_instance",
        parentId: "frame-1",
        definitionId: "fill-component",
        instanceId: "fill-instance"
      },
      {
        type: "set_node_style",
        nodeId: "fill-instance",
        style: { ...baseStyle, fills: orderedFills }
      }
    ]);

    const frame = result.document.pages[0].children[0];
    const instance = frame.children.find((node) => node.id === "fill-instance");
    expect(instance?.style.fills).toEqual(orderedFills);
    expect(instance?.component_instance?.overrides).toContainEqual({
      node_id: "fill-source",
      field: "fills",
      value: JSON.stringify(orderedFills)
    });
  });
});
