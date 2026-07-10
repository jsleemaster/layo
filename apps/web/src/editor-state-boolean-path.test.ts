import { describe, expect, test } from "vitest";
import type { RendererDocument, RendererNode } from "@layo/renderer";
import {
  createEditorState,
  executeEditorCommand,
  redo,
  undo
} from "./editor-state";

describe("boolean path editor history", () => {
  test("creates, changes, detaches, undoes, and redoes one atomic boolean relation", () => {
    const initial = createEditorState(documentFixture());
    const created = executeEditorCommand(initial, {
      type: "create_boolean_path",
      nodeId: "boolean-1",
      name: "Union",
      operation: "union",
      sourceNodeIds: ["path-left", "path-right"]
    });

    expect(created.document.pages[0].children[0]).toMatchObject({
      id: "boolean-1",
      content: {
        type: "boolean_path",
        relation: {
          operation: "union",
          source_node_ids: ["path-left", "path-right"]
        }
      }
    });
    expect(created.history.past).toHaveLength(1);

    const changed = executeEditorCommand(created, {
      type: "set_boolean_path_operation",
      nodeId: "boolean-1",
      operation: "difference"
    });
    expect(changed.document.pages[0].children[0].content).toMatchObject({
      type: "boolean_path",
      relation: { operation: "difference" }
    });

    const restoredUnion = undo(changed);
    expect(restoredUnion.document.pages[0].children[0].content).toMatchObject({
      type: "boolean_path",
      relation: { operation: "union" }
    });
    expect(redo(restoredUnion).document.pages[0].children[0].content).toMatchObject({
      type: "boolean_path",
      relation: { operation: "difference" }
    });

    const detached = executeEditorCommand(changed, {
      type: "detach_boolean_path",
      nodeId: "boolean-1"
    });
    expect(detached.document.pages[0].children.map((node) => node.id)).toEqual([
      "path-left",
      "path-right"
    ]);
    expect(undo(detached).document.pages[0].children[0].id).toBe("boolean-1");
  });
});

function documentFixture(): RendererDocument {
  return {
    id: "boolean-file",
    name: "Boolean file",
    pages: [{
      id: "page-1",
      name: "Page 1",
      children: [pathNode("path-left", 0), pathNode("path-right", 50)]
    }]
  };
}

function pathNode(id: string, x: number): RendererNode {
  return {
    id,
    kind: "path",
    name: id,
    transform: { x, y: 0, rotation: 0 },
    size: { width: 100, height: 100 },
    style: { fill: "#2563eb", stroke: null, stroke_width: 0, opacity: 1 },
    content: {
      type: "path",
      path_data: "M0 0 H100 V100 H0 Z",
      fill_rule: "nonzero"
    },
    children: []
  };
}
