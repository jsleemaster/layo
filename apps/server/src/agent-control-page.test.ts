import { describe, expect, test } from "vitest";
import { applyAgentCommandsToDocument } from "./agent-control-base";
import { sampleDocument } from "./sample-document";
import type { DesignFile } from "./storage";

function createDocument(): DesignFile {
  return structuredClone(sampleDocument) as DesignFile;
}

describe("agent page commands", () => {
  test("creates, renames, reorders, and deletes pages without mutating the source document", () => {
    const source = createDocument();
    const created = applyAgentCommandsToDocument(source, [
      { type: "create_page", pageId: "page-2", index: 0 }
    ]);

    expect(source.pages.map((page) => page.id)).toEqual(["page-1"]);
    expect(created.document.pages).toMatchObject([
      { id: "page-2", name: "페이지 2", children: [] },
      { id: "page-1", name: "페이지 1" }
    ]);
    expect(created.changedNodeIds).toEqual(["page-2"]);

    const renamed = applyAgentCommandsToDocument(created.document, [
      { type: "rename_page", pageId: "page-2", name: "  검토 기록  " }
    ]);
    expect(renamed.document.pages[0]?.name).toBe("검토 기록");

    const reordered = applyAgentCommandsToDocument(renamed.document, [
      { type: "reorder_page", pageId: "page-2", toIndex: 1 }
    ]);
    expect(reordered.document.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);

    const deleted = applyAgentCommandsToDocument(reordered.document, [
      { type: "delete_page", pageId: "page-2" }
    ]);
    expect(deleted.document.pages.map((page) => page.id)).toEqual(["page-1"]);
    expect(deleted.changedNodeIds).toEqual(["page-2"]);
  });

  test("rejects duplicate ids, blank names, invalid indices, missing pages, and deleting the last page", () => {
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "create_page", pageId: "page-1" }
      ])
    ).toThrow("page id already exists: page-1");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "create_page", pageId: "frame-1" }
      ])
    ).toThrow("page id already exists: frame-1");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "create_page", pageId: "page-2", name: "   " }
      ])
    ).toThrow("page name is required");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "create_page", pageId: "page-2", index: 2 }
      ])
    ).toThrow("page index is out of bounds: 2");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "create_page", pageId: "page-2", index: 0.5 }
      ])
    ).toThrow("page index must be an integer: 0.5");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "rename_page", pageId: "page-1", name: "   " }
      ])
    ).toThrow("page name is required");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "reorder_page", pageId: "page-1", toIndex: 1 }
      ])
    ).toThrow("page index is out of bounds: 1");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "rename_page", pageId: "missing-page", name: "Missing" }
      ])
    ).toThrow("page not found: missing-page");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "reorder_page", pageId: "missing-page", toIndex: 0 }
      ])
    ).toThrow("page not found: missing-page");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "delete_page", pageId: "missing-page" }
      ])
    ).toThrow("page not found: missing-page");
    expect(() =>
      applyAgentCommandsToDocument(createDocument(), [
        { type: "delete_page", pageId: "page-1" }
      ])
    ).toThrow("cannot delete the last page");
  });

  test("keeps same-index reorder stable and removes the complete subtree of a deleted page", () => {
    const source = createDocument();
    const withSecondPage = applyAgentCommandsToDocument(source, [
      { type: "create_page", pageId: "page-2" }
    ]).document;
    const unchanged = applyAgentCommandsToDocument(withSecondPage, [
      { type: "reorder_page", pageId: "page-1", toIndex: 0 }
    ]);
    expect(unchanged.document.pages).toEqual(withSecondPage.pages);

    const deleted = applyAgentCommandsToDocument(withSecondPage, [
      { type: "delete_page", pageId: "page-1" }
    ]);
    expect(deleted.document.pages).toEqual([{ id: "page-2", name: "페이지 2", children: [] }]);
    expect(JSON.stringify(deleted.document)).not.toContain("frame-1");
    expect(JSON.stringify(withSecondPage)).toContain("frame-1");
  });
});
