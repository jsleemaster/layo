import { describe, expect, test } from "vitest";
import { applyAgentCommandsToDocument, validateDocument } from "./agent-control";
import type { DesignFile, DesignNode } from "./storage";

describe("non-destructive boolean path commands", () => {
  test("creates, updates, and detaches a boolean path without losing operands", () => {
    const source = createBooleanFixture();

    const created = applyAgentCommandsToDocument(source, [{
      type: "create_boolean_path",
      nodeId: "boolean-1",
      name: "Combined paths",
      operation: "union",
      sourceNodeIds: ["path-left", "path-right"]
    }]);
    const booleanNode = created.document.pages[0].children[0];

    expect(created.changedNodeIds).toEqual(["boolean-1", "path-left", "path-right"]);
    expect(booleanNode).toMatchObject({
      id: "boolean-1",
      kind: "path",
      name: "Combined paths",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 150, height: 100 },
      content: {
        type: "boolean_path",
        relation: {
          operation: "union",
          source_node_ids: ["path-left", "path-right"]
        },
        fill_rule: "nonzero"
      }
    });
    expect(booleanNode.children.map((node) => node.id)).toEqual(["path-left", "path-right"]);
    expect(booleanNode.content.type === "boolean_path" && booleanNode.content.path_data).toMatch(/^M/);

    const updated = applyAgentCommandsToDocument(created.document, [{
      type: "set_boolean_path_operation",
      nodeId: "boolean-1",
      operation: "intersection"
    }]);
    const intersection = updated.document.pages[0].children[0];

    expect(intersection).toMatchObject({
      size: { width: 50, height: 100 },
      content: {
        type: "boolean_path",
        relation: { operation: "intersection" }
      }
    });

    const detached = applyAgentCommandsToDocument(updated.document, [{
      type: "detach_boolean_path",
      nodeId: "boolean-1"
    }]);

    expect(detached.document.pages[0].children.map((node) => node.id)).toEqual([
      "path-left",
      "path-right"
    ]);
    expect(detached.document.pages[0].children.map((node) => node.transform.x)).toEqual([0, 50]);
  });

  test("recomputes rotated boolean bounds in parent coordinates", () => {
    const created = applyAgentCommandsToDocument(createBooleanFixture(), [{
      type: "create_boolean_path",
      nodeId: "boolean-rotated",
      name: "Rotated union",
      operation: "union",
      sourceNodeIds: ["path-left", "path-right"]
    }]).document;
    created.pages[0].children[0].transform = { x: 10, y: 20, rotation: 90 };

    const updated = applyAgentCommandsToDocument(created, [{
      type: "set_boolean_path_operation",
      nodeId: "boolean-rotated",
      operation: "intersection"
    }]).document.pages[0].children[0];

    expect(updated.transform.x).toBeCloseTo(10);
    expect(updated.transform.y).toBeCloseTo(70);
    expect(updated.size).toEqual({ width: 50, height: 100 });
  });

  test("rejects open source geometry", () => {
    const source = createBooleanFixture();
    const left = source.pages[0].children[0];
    if (left.content.type === "path") {
      left.content.path_data = "M0 0 H100 V100";
    }

    expect(() =>
      applyAgentCommandsToDocument(source, [{
        type: "create_boolean_path",
        nodeId: "boolean-open",
        name: "Open",
        operation: "union",
        sourceNodeIds: ["path-left", "path-right"]
      }])
    ).toThrow("closed geometry");
  });

  test("validates missing boolean operands and empty evaluated geometry", () => {
    const created = applyAgentCommandsToDocument(createBooleanFixture(), [{
      type: "create_boolean_path",
      nodeId: "boolean-1",
      name: "Union",
      operation: "union",
      sourceNodeIds: ["path-left", "path-right"]
    }]).document;
    const booleanNode = created.pages[0].children[0];
    booleanNode.children.pop();
    if (booleanNode.content.type === "boolean_path") {
      booleanNode.content.path_data = "";
    }

    expect(validateDocument(created)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "missing_boolean_path_source",
          nodeId: "boolean-1"
        }),
        expect.objectContaining({
          code: "empty_boolean_path_result",
          nodeId: "boolean-1"
        })
      ])
    });
  });

  test("validates invalid relation operations and non-path source children", () => {
    const created = applyAgentCommandsToDocument(createBooleanFixture(), [{
      type: "create_boolean_path",
      nodeId: "boolean-invalid-relation",
      name: "Invalid relation",
      operation: "union",
      sourceNodeIds: ["path-left", "path-right"]
    }]).document;
    const booleanNode = created.pages[0].children[0];
    if (booleanNode.content.type !== "boolean_path") {
      throw new Error("boolean fixture was not created");
    }
    booleanNode.content.relation.operation = "invalid" as never;
    booleanNode.children[0].kind = "rectangle";
    booleanNode.children[0].content = { type: "empty" };

    expect(validateDocument(created).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_boolean_path_operation" }),
      expect.objectContaining({ code: "invalid_boolean_path_source_geometry" })
    ]));
  });

  test("rejects missing, duplicate, and non-path operands", () => {
    const source = createBooleanFixture();
    source.pages[0].children.push({
      ...source.pages[0].children[0],
      id: "rectangle-1",
      kind: "rectangle",
      content: { type: "empty" }
    });

    expect(() =>
      applyAgentCommandsToDocument(source, [{
        type: "create_boolean_path",
        nodeId: "boolean-missing",
        name: "Missing",
        operation: "union",
        sourceNodeIds: ["path-left", "missing"]
      }])
    ).toThrow("boolean path source not found");

    expect(() =>
      applyAgentCommandsToDocument(source, [{
        type: "create_boolean_path",
        nodeId: "boolean-duplicate",
        name: "Duplicate",
        operation: "union",
        sourceNodeIds: ["path-left", "path-left"]
      }])
    ).toThrow("boolean path sources must be unique");

    expect(() =>
      applyAgentCommandsToDocument(source, [{
        type: "create_boolean_path",
        nodeId: "boolean-invalid",
        name: "Invalid",
        operation: "union",
        sourceNodeIds: ["path-left", "rectangle-1"]
      }])
    ).toThrow("boolean path source must be path geometry");
  });
});

function createBooleanFixture(): DesignFile {
  return {
    id: "boolean-file",
    name: "Boolean file",
    version: 1,
    pages: [{
      id: "page-1",
      name: "Page 1",
      children: [
        pathNode("path-left", 0),
        pathNode("path-right", 50)
      ]
    }]
  };
}

function pathNode(id: string, x: number): DesignNode {
  return {
    id,
    kind: "path",
    name: id,
    transform: { x, y: 0, rotation: 0 },
    size: { width: 100, height: 100 },
    style: {
      fill: "#2563eb",
      stroke: null,
      stroke_width: 0,
      opacity: 1
    },
    content: {
      type: "path",
      path_data: "M0 0 H100 V100 H0 Z",
      fill_rule: "nonzero"
    },
    children: []
  };
}
