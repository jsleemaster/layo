import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

test("agent commands keep wrapped fill children on the same row after parent resize", async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
  const storage = new FileStorage(tempRoot);
  await storage.createProject({
    projectId: "test-project",
    name: "테스트 프로젝트",
    documentId: "sample-file",
    documentName: "테스트 문서"
  });

  const result = await storage.applyAgentCommands("sample-file", {
    dryRun: true,
    commands: [
      { type: "update_geometry", nodeId: "frame-1", width: 420, height: 180 },
      { type: "update_geometry", nodeId: "text-1", width: 80, height: 40 },
      {
        type: "set_layout",
        nodeId: "frame-1",
        layout: {
          mode: "auto",
          direction: "horizontal",
          wrap: "wrap",
          align_content: "start",
          align_items: "start",
          justify_content: "start",
          gap: 10,
          padding: { top: 20, right: 20, bottom: 20, left: 20 }
        }
      },
      {
        type: "create_rectangle",
        parentId: "frame-1",
        id: "wrap-fill-fixed-rectangle-1",
        name: "줄바꿈 고정 사각형",
        width: 80,
        height: 40
      },
      {
        type: "set_layout_item",
        nodeId: "text-1",
        layoutItem: { width_sizing: "fill" }
      },
      { type: "update_geometry", nodeId: "frame-1", width: 360 }
    ] as any
  });

  const frame = result.preview.pages[0].children[0];
  const fillChild = frame.children.find((node) => node.id === "text-1");
  const fixedChild = frame.children.find((node) => node.id === "wrap-fill-fixed-rectangle-1");

  expect(fillChild?.layout_item).toMatchObject({ width_sizing: "fill" });
  expect(fillChild?.size.width).toBe(230);
  expect(fillChild?.transform).toMatchObject({ x: 20, y: 20 });
  expect(fixedChild?.transform).toMatchObject({ x: 260, y: 20 });
});
