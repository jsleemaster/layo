import { describe, expect, test } from "vitest";
import {
  DocumentSnapshotConflictError,
  mergeConcurrentDocumentSnapshots,
  type RendererDocument
} from "./index";

describe("mergeConcurrentDocumentSnapshots", () => {
  test("applies a restored fill while preserving a remote text edit", () => {
    const base = sampleDocument();
    const restored = structuredClone(base);
    restored.pages[0]!.children[0]!.style.fill = "#16a34a";
    const current = structuredClone(base);
    const currentHeadline = current.pages[0]!.children[0]!.children[0]!;
    if (currentHeadline.content.type !== "text") {
      throw new Error("missing headline");
    }
    currentHeadline.content.value = "복원 중 원격 편집";

    const merged = mergeConcurrentDocumentSnapshots(base, restored, current);

    expect(merged.pages[0]!.children[0]!.style.fill).toBe("#16a34a");
    expect(merged.pages[0]!.children[0]!.children[0]!.content).toMatchObject({
      type: "text",
      value: "복원 중 원격 편집"
    });
    expect(base.pages[0]!.children[0]!.style.fill).toBe("#2563eb");
  });

  test("rejects divergent edits to the same scalar field", () => {
    const base = sampleDocument();
    const restored = structuredClone(base);
    const current = structuredClone(base);
    const restoredHeadline = restored.pages[0]!.children[0]!.children[0]!;
    const currentHeadline = current.pages[0]!.children[0]!.children[0]!;
    if (restoredHeadline.content.type !== "text" || currentHeadline.content.type !== "text") {
      throw new Error("missing headline");
    }
    restoredHeadline.content.value = "복원 텍스트";
    currentHeadline.content.value = "원격 텍스트";

    expect(() => mergeConcurrentDocumentSnapshots(base, restored, current)).toThrow(
      DocumentSnapshotConflictError
    );
  });

  test("prefers the latest room edit while reverting unrelated restored fields", () => {
    const rollback = sampleDocument();
    const applied = structuredClone(rollback);
    applied.pages[0]!.children[0]!.style.fill = "#16a34a";
    const appliedHeadline = applied.pages[0]!.children[0]!.children[0]!;
    if (appliedHeadline.content.type !== "text") {
      throw new Error("missing headline");
    }
    appliedHeadline.content.value = "복원 텍스트";
    const latestRoom = structuredClone(applied);
    const latestHeadline = latestRoom.pages[0]!.children[0]!.children[0]!;
    if (latestHeadline.content.type !== "text") {
      throw new Error("missing headline");
    }
    latestHeadline.content.value = "복원 뒤 원격 편집";

    const compensated = mergeConcurrentDocumentSnapshots(applied, rollback, latestRoom, {
      conflictPreference: "current"
    });

    expect(compensated.pages[0]!.children[0]!.style.fill).toBe("#2563eb");
    expect(compensated.pages[0]!.children[0]!.children[0]!.content).toMatchObject({
      type: "text",
      value: "복원 뒤 원격 편집"
    });
  });

  test("prefers compensation conflicts while retaining independent server edits", () => {
    const persistenceDocument = sampleDocument();
    persistenceDocument.pages[0]!.children[0]!.style.fill = "#16a34a";
    const compensationDocument = sampleDocument();
    const compensationHeadline = compensationDocument.pages[0]!.children[0]!.children[0]!;
    if (compensationHeadline.content.type !== "text") {
      throw new Error("missing headline");
    }
    compensationHeadline.content.value = "Yjs 보상 편집";
    const persistedServerDocument = structuredClone(persistenceDocument);
    persistedServerDocument.pages[0]!.children[0]!.transform.x = 144;
    const serverHeadline = persistedServerDocument.pages[0]!.children[0]!.children[0]!;
    if (serverHeadline.content.type !== "text") {
      throw new Error("missing headline");
    }
    serverHeadline.content.value = "서버 충돌 편집";

    const compensated = mergeConcurrentDocumentSnapshots(
      persistenceDocument,
      compensationDocument,
      persistedServerDocument,
      { conflictPreference: "local" }
    );

    expect(compensated.pages[0]!.children[0]!.style.fill).toBe("#2563eb");
    expect(compensated.pages[0]!.children[0]!.transform.x).toBe(144);
    expect(compensated.pages[0]!.children[0]!.children[0]!.content).toMatchObject({
      type: "text",
      value: "Yjs 보상 편집"
    });
  });
});

function sampleDocument(): RendererDocument {
  return {
    id: "sample-file",
    name: "Sample file",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "frame-1",
            kind: "frame",
            name: "랜딩 프레임",
            transform: { x: 0, y: 0, rotation: 0 },
            size: { width: 640, height: 480 },
            style: { fill: "#2563eb", stroke: null, stroke_width: 0, opacity: 1 },
            content: { type: "empty" },
            children: [
              {
                id: "text-1",
                kind: "text",
                name: "헤드라인",
                transform: { x: 32, y: 40, rotation: 0 },
                size: { width: 260, height: 48 },
                style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
                content: { type: "text", value: "Layo", font_size: 32, font_family: "Inter" },
                children: []
              }
            ]
          }
        ]
      }
    ]
  };
}
