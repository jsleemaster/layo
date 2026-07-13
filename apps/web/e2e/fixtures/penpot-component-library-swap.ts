import { Buffer } from "node:buffer";
import { createZipArchive } from "../../../server/src/file-archive";

export const penpotLibrarySwapIds = {
  fileId: "11111111-1111-1111-1111-111111111111",
  pageId: "22222222-2222-2222-2222-222222222222",
  libraryFileId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  libraryPageId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  rectangleComponentId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1",
  circleComponentId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2",
  rectangleMainId: "ffffffff-ffff-ffff-ffff-fffffffffff1",
  circleMainId: "ffffffff-ffff-ffff-ffff-fffffffffff2",
  outerComponentId: "12121212-1212-1212-1212-121212121212",
  outerMainId: "13131313-1313-1313-1313-131313131313",
  outerMainSlotId: "14141414-1414-1414-1414-141414141414",
  outerCopyId: "15151515-1515-1515-1515-151515151515",
  outerCopySlotId: "16161616-1616-1616-1616-161616161616"
} as const;

export function createPenpotComponentLibrarySwapArchive(): Buffer {
  const ids = penpotLibrarySwapIds;
  const json = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
  const shape = (
    id: string,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    extra: Record<string, unknown> = {}
  ) => ({ id, name, type: "frame", x, y, width, height, ...extra });

  return createZipArchive([
    {
      path: "manifest.json",
      data: json({
        type: "penpot/export-files",
        version: 1,
        files: [
          { id: ids.fileId, name: "Product file", features: ["components/v2"] },
          { id: ids.libraryFileId, name: "Shape library", features: ["components/v2"] }
        ]
      })
    },
    { path: `files/${ids.fileId}.json`, data: json({ id: ids.fileId, name: "Product file" }) },
    {
      path: `files/${ids.fileId}/pages/${ids.pageId}.json`,
      data: json({ id: ids.pageId, name: "Product", index: 0, objects: {} })
    },
    {
      path: `files/${ids.fileId}/pages/${ids.pageId}/${ids.outerMainId}.json`,
      data: json(shape(ids.outerMainId, "Card", 80, 80, 240, 160, {
        "main-instance": true,
        "component-root": true,
        "component-id": ids.outerComponentId,
        "component-file": ids.fileId,
        shapes: [ids.outerMainSlotId]
      }))
    },
    {
      path: `files/${ids.fileId}/pages/${ids.pageId}/${ids.outerMainSlotId}.json`,
      data: json(shape(ids.outerMainSlotId, "Rectangle slot", 112, 112, 64, 64, {
        "component-id": ids.rectangleComponentId,
        "component-file": ids.libraryFileId,
        "shape-ref": ids.rectangleMainId
      }))
    },
    {
      path: `files/${ids.fileId}/pages/${ids.pageId}/${ids.outerCopyId}.json`,
      data: json(shape(ids.outerCopyId, "Card copy", 400, 80, 240, 160, {
        "component-root": true,
        "component-id": ids.outerComponentId,
        "component-file": ids.fileId,
        "shape-ref": ids.outerMainId,
        shapes: [ids.outerCopySlotId]
      }))
    },
    {
      path: `files/${ids.fileId}/pages/${ids.pageId}/${ids.outerCopySlotId}.json`,
      data: json(shape(ids.outerCopySlotId, "Circle slot", 432, 112, 64, 64, {
        "component-id": ids.circleComponentId,
        "component-file": ids.libraryFileId,
        "shape-ref": ids.circleMainId,
        touched: [`swap-slot-${ids.outerMainSlotId}`]
      }))
    },
    { path: `files/${ids.libraryFileId}.json`, data: json({ id: ids.libraryFileId, name: "Shape library" }) },
    {
      path: `files/${ids.libraryFileId}/pages/${ids.libraryPageId}.json`,
      data: json({ id: ids.libraryPageId, name: "Shapes", index: 0, objects: {} })
    },
    {
      path: `files/${ids.libraryFileId}/pages/${ids.libraryPageId}/${ids.rectangleMainId}.json`,
      data: json(shape(ids.rectangleMainId, "Rectangle", 80, 80, 64, 64, {
        "main-instance": true,
        "component-root": true,
        "component-id": ids.rectangleComponentId,
        "component-file": ids.libraryFileId,
        fills: [{ fillColor: "#2563eb", fillOpacity: 1 }]
      }))
    },
    {
      path: `files/${ids.libraryFileId}/pages/${ids.libraryPageId}/${ids.circleMainId}.json`,
      data: json(shape(ids.circleMainId, "Circle", 200, 80, 64, 64, {
        "main-instance": true,
        "component-root": true,
        "component-id": ids.circleComponentId,
        "component-file": ids.libraryFileId,
        fills: [{ fillColor: "#f97316", fillOpacity: 1 }]
      }))
    }
  ]);
}
