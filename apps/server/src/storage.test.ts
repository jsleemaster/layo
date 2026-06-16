import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("FileStorage", () => {
  test("seeds and lists the sample document", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const files = await storage.listFiles();

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      id: "sample-file",
      name: "Sample File"
    });
  });

  test("reads a stored document by file id", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const document = await storage.readFile("sample-file");

    expect(document).toMatchObject({
      id: "sample-file",
      name: "Sample File"
    });
  });

  test("updates node geometry and persists the document", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const node = await storage.updateNodeGeometry("sample-file", "text-1", {
      x: 88,
      y: 99,
      width: 180,
      height: 36
    });
    const document = await storage.readFile("sample-file");

    expect(node.transform).toMatchObject({ x: 88, y: 99 });
    expect(node.size).toMatchObject({ width: 180, height: 36 });
    expect(JSON.stringify(document)).toContain('"x":88');
  });

  test("updates fill and text content", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const filled = await storage.setNodeFill("sample-file", "text-1", "#2563eb");
    const text = await storage.updateText("sample-file", "text-1", "Saved headline");

    expect(filled.style.fill).toBe("#2563eb");
    expect(text.content).toMatchObject({ type: "text", value: "Saved headline" });
  });

  test("creates a node under a page parent", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const node = await storage.createNode("sample-file", "page-1", {
      id: "rectangle-99",
      kind: "rectangle",
      name: "Rectangle 99",
      transform: { x: 12, y: 24, rotation: 0 },
      size: { width: 100, height: 80 },
      style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: []
    });
    const document = await storage.readFile("sample-file");

    expect(node.id).toBe("rectangle-99");
    expect(JSON.stringify(document)).toContain("Rectangle 99");
  });
});
