import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
      name: "샘플 파일"
    });
  });

  test("reads a stored document by file id", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const document = await storage.readFile("sample-file");

    expect(document).toMatchObject({
      id: "sample-file",
      name: "샘플 파일"
    });
  });

  test("upgrades legacy English sample labels without replacing user geometry", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const filesDir = path.join(tempRoot, "files");
    await mkdir(filesDir, { recursive: true });
    await writeFile(
      path.join(filesDir, "sample-file.json"),
      `${JSON.stringify(
        {
          id: "sample-file",
          name: "Sample File",
          version: 1,
          pages: [
            {
              id: "page-1",
              name: "Page 1",
              children: [
                {
                  id: "frame-1",
                  kind: "frame",
                  name: "Landing Frame",
                  children: [
                    {
                      id: "text-1",
                      kind: "text",
                      name: "Headline",
                      children: [],
                      transform: { x: 321, y: 40, rotation: 0 },
                      size: { width: 260, height: 48 },
                      style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
                      content: {
                        type: "text",
                        value: "Canvas MCP Editor",
                        font_size: 28,
                        font_family: "Inter"
                      }
                    }
                  ],
                  transform: { x: 120, y: 80, rotation: 0 },
                  size: { width: 420, height: 280 },
                  style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 },
                  content: { type: "empty" }
                }
              ]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    const storage = new FileStorage(tempRoot);

    const document = await storage.readFile("sample-file");

    expect(document.name).toBe("샘플 파일");
    expect(document.pages[0]?.name).toBe("페이지 1");
    expect(document.pages[0]?.children[0]?.name).toBe("랜딩 프레임");
    expect(document.pages[0]?.children[0]?.children[0]?.name).toBe("헤드라인");
    expect(document.pages[0]?.children[0]?.children[0]?.transform.x).toBe(321);
    expect(document.pages[0]?.children[0]?.children[0]?.content).toMatchObject({
      type: "text",
      value: "캔버스 MCP 에디터"
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
    const text = await storage.updateText("sample-file", "text-1", "저장된 헤드라인");

    expect(filled.style.fill).toBe("#2563eb");
    expect(text.content).toMatchObject({ type: "text", value: "저장된 헤드라인" });
  });

  test("creates a node under a page parent", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const node = await storage.createNode("sample-file", "page-1", {
      id: "rectangle-99",
      kind: "rectangle",
      name: "사각형 99",
      transform: { x: 12, y: 24, rotation: 0 },
      size: { width: 100, height: 80 },
      style: { fill: "#e0f2fe", stroke: "#0284c7", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: []
    });
    const document = await storage.readFile("sample-file");

    expect(node.id).toBe("rectangle-99");
    expect(JSON.stringify(document)).toContain("사각형 99");
  });

  test("creates components, instances, and detaches instances", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const component = await storage.createComponent("sample-file", "frame-1", {
      componentId: "component-1",
      name: "Card"
    });
    const instance = await storage.createComponentInstance("sample-file", {
      parentId: "page-1",
      definitionId: "component-1",
      instanceId: "instance-1",
      x: 520,
      y: 140
    });
    const detached = await storage.detachInstance("sample-file", "instance-1");
    const components = await storage.listComponents("sample-file");

    expect(component.id).toBe("component-1");
    expect(components).toHaveLength(1);
    expect(instance.kind).toBe("component_instance");
    expect(instance.component_instance?.definition_id).toBe("component-1");
    expect(detached.kind).toBe("frame");
    expect(detached.component_instance).toBeNull();
  });

  test("inspects and searches canvas nodes for agent workflows", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const inspection = await storage.inspectCanvas("sample-file");
    const matches = await storage.findNodes("sample-file", { text: "캔버스" });

    expect(inspection.file.id).toBe("sample-file");
    expect(inspection.nodeCount).toBe(2);
    expect(inspection.pages[0]).toMatchObject({ id: "page-1", name: "페이지 1", nodeCount: 2 });
    expect(inspection.componentCount).toBe(0);
    expect(inspection.validation.issueCount).toBe(0);
    expect(matches.map((node) => node.id)).toEqual(["text-1"]);
    expect(matches[0]).toMatchObject({
      name: "헤드라인",
      kind: "text",
      text: "캔버스 MCP 에디터",
      path: ["page-1", "frame-1", "text-1"]
    });
  });

  test("dry-runs and persists agent command batches with audit summaries", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const before = await storage.readFile("sample-file");
    const dryRun = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "create_text",
          parentId: "page-1",
          id: "agent-note",
          name: "에이전트 메모",
          value: "에이전트가 수정함",
          x: 96,
          y: 360,
          width: 240,
          height: 48,
          fill: "#111827",
          fontSize: 20,
          fontFamily: "Inter"
        }
      ]
    });
    const afterDryRun = await storage.readFile("sample-file");

    expect(JSON.stringify(dryRun.preview)).toContain("에이전트가 수정함");
    expect(JSON.stringify(afterDryRun)).not.toContain("에이전트가 수정함");
    expect(dryRun.audit).toMatchObject({
      fileId: "sample-file",
      dryRun: true,
      commandCount: 1,
      commandTypes: ["create_text"],
      changedNodeIds: ["agent-note"]
    });

    const persisted = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_text",
          parentId: "page-1",
          id: "agent-note",
          name: "에이전트 메모",
          value: "에이전트가 수정함",
          x: 96,
          y: 360,
          width: 240,
          height: 48,
          fill: "#111827",
          fontSize: 20,
          fontFamily: "Inter"
        }
      ]
    });
    const after = await storage.readFile("sample-file");
    const validation = await storage.validateDocument("sample-file");
    const summary = await storage.getChangeSummary("sample-file", before, after);

    expect(JSON.stringify(after)).toContain("에이전트가 수정함");
    expect(persisted.persisted).toBe(true);
    expect(validation.issueCount).toBe(0);
    expect(summary.createdNodeIds).toEqual(["agent-note"]);
    expect(summary.updatedNodeIds).toEqual([]);
  });

  test("agent commands apply auto layout and constraints deterministically", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-mcp-editor-"));
    const storage = new FileStorage(tempRoot);

    const autoLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "vertical",
            gap: 12,
            padding: { top: 20, right: 24, bottom: 20, left: 24 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "layout-rectangle",
          name: "레이아웃 사각형",
          width: 160,
          height: 96
        }
      ] as any
    });

    const autoFrame = autoLayout.preview.pages[0].children[0];
    expect(autoFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 24,
      y: 20
    });
    expect(autoFrame.children.find((node) => node.id === "layout-rectangle")?.transform).toMatchObject({
      x: 24,
      y: 80
    });
    expect(autoLayout.audit.commandTypes).toEqual(["set_layout", "create_rectangle"]);

    const constrained = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "badge-1",
          name: "Badge",
          x: 300,
          y: 220,
          width: 80,
          height: 32
        },
        {
          type: "set_constraints",
          nodeId: "badge-1",
          constraints: { horizontal: "right", vertical: "bottom" }
        },
        {
          type: "update_geometry",
          nodeId: "frame-1",
          width: 520,
          height: 340
        }
      ] as any
    });
    const resizedFrame = constrained.preview.pages[0].children[0];

    expect(resizedFrame.children.find((node) => node.id === "badge-1")?.transform).toMatchObject({
      x: 400,
      y: 280
    });
  });
});
