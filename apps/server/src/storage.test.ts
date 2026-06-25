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
  test("adopts a prior local store when the default Layo store does not exist", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const priorStoreName = [".canvas", "mcp", "editor"].join("-");
      const priorFilesDir = path.join(tempRoot, priorStoreName, "files");
      await mkdir(priorFilesDir, { recursive: true });
      await writeFile(
        path.join(priorFilesDir, "document-alpha.json"),
        JSON.stringify({ id: "document-alpha", name: "기존 문서", pages: [] }, null, 2),
        "utf8"
      );

      const storage = new FileStorage();

      const files = await storage.listFiles();

      expect(files).toMatchObject([{ id: "document-alpha", name: "기존 문서" }]);
      expect(files[0].path).toContain(`${path.sep}.layo${path.sep}`);
    } finally {
      process.chdir(previousCwd);
    }
  });

  test("starts without a generated sample document", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    const files = await storage.listFiles();

    expect(files).toEqual([]);
  });

  test("reads an explicitly created document by file id", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "project-alpha",
      name: "알파 프로젝트",
      documentId: "document-alpha",
      documentName: "알파 문서"
    });

    const document = await storage.readFile("document-alpha");

    expect(document).toMatchObject({
      id: "document-alpha",
      name: "알파 문서"
    });
  });

  test("starts without a generated sample project", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    const projects = await storage.listProjects();

    expect(projects).toEqual([]);
  });

  test("removes the legacy sample project and its orphaned document even when modified", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "sample-project",
      name: "샘플 프로젝트",
      documentId: "sample-file",
      documentName: "샘플 파일"
    });
    await storage.updateText("sample-file", "text-1", "사용자가 수정한 문서");

    const projects = await storage.listProjects();
    const files = await storage.listFiles();

    expect(projects).toEqual([]);
    expect(files).toEqual([]);
    await expect(storage.readProject("sample-project")).rejects.toThrow();
    await expect(storage.readFile("sample-file")).rejects.toThrow();
  });

  test("preserves a sample-id document when it belongs to a real project", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "project-real",
      name: "실제 프로젝트",
      documentId: "sample-file",
      documentName: "실제 문서"
    });

    const projects = await storage.listProjects();
    const files = await storage.listFiles();

    expect(projects.map((project) => project.projectId)).toEqual(["project-real"]);
    expect(files.map((file) => file.id)).toEqual(["sample-file"]);
  });

  test("creates, reads, renames, shares, and appends documents to projects", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    const created = await storage.createProject({
      projectId: "project-alpha",
      name: "알파 프로젝트",
      documentId: "document-alpha",
      documentName: "알파 문서"
    });
    expect(created).toMatchObject({
      projectId: "project-alpha",
      name: "알파 프로젝트",
      currentDocumentId: "document-alpha",
      sharing: { mode: "private" }
    });
    expect(await storage.readFile("document-alpha")).toMatchObject({
      id: "document-alpha",
      name: "알파 문서"
    });

    const renamed = await storage.updateProject("project-alpha", { name: "리네임 프로젝트" });
    expect(renamed.name).toBe("리네임 프로젝트");

    const nextDocument = await storage.createProjectDocument("project-alpha", {
      documentId: "document-beta",
      name: "베타 문서"
    });
    expect(nextDocument.currentDocumentId).toBe("document-beta");
    expect(nextDocument.documents.map((document) => document.documentId)).toEqual([
      "document-alpha",
      "document-beta"
    ]);

    const shared = await storage.setProjectSharing("project-alpha", {
      mode: "team",
      teamId: "team-alpha"
    });
    expect(shared.sharing).toEqual({ mode: "team", teamId: "team-alpha" });

    const privateProject = await storage.setProjectSharing("project-alpha", { mode: "private" });
    expect(privateProject.sharing).toEqual({ mode: "private" });
  });

  test("duplicates a project with copied documents and private sharing", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    await storage.createProject({
      projectId: "project-source",
      name: "원본 프로젝트",
      documentId: "document-source",
      documentName: "원본 문서"
    });
    await storage.updateText("document-source", "text-1", "복제할 헤드라인");
    await storage.setProjectSharing("project-source", { mode: "team", teamId: "team-source" });

    const duplicated = await storage.duplicateProject("project-source", {
      projectId: "project-copy",
      name: "복제 프로젝트",
      documentIdPrefix: "copy"
    });

    expect(duplicated).toMatchObject({
      projectId: "project-copy",
      name: "복제 프로젝트",
      sharing: { mode: "private" }
    });
    expect(duplicated.currentDocumentId).toBe("copy-document-source");
    expect(duplicated.documents).toEqual([
      expect.objectContaining({
        documentId: "copy-document-source",
        name: "원본 문서 사본"
      })
    ]);
    expect(await storage.readFile("document-source")).toMatchObject({
      id: "document-source",
      name: "원본 문서"
    });
    expect(await storage.readFile("copy-document-source")).toMatchObject({
      id: "copy-document-source",
      name: "원본 문서 사본",
      pages: [
        expect.objectContaining({
          children: [
            expect.objectContaining({
              children: [
                expect.objectContaining({
                  content: expect.objectContaining({ value: "복제할 헤드라인" })
                })
              ]
            })
          ]
        })
      ]
    });
  });

  test("deletes a project and its owned documents while preserving other projects", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    await storage.createProject({
      projectId: "project-delete",
      name: "삭제 프로젝트",
      documentId: "document-delete",
      documentName: "삭제 문서"
    });
    await storage.createProject({
      projectId: "project-keep",
      name: "유지 프로젝트",
      documentId: "document-keep",
      documentName: "유지 문서"
    });

    const deleted = await storage.deleteProject("project-delete");

    expect(deleted.projectId).toBe("project-delete");
    await expect(storage.readProject("project-delete")).rejects.toThrow();
    await expect(storage.readFile("document-delete")).rejects.toThrow();
    await expect(storage.readFile("document-keep")).resolves.toMatchObject({ id: "document-keep" });
    await expect(storage.deleteProject("project-keep")).rejects.toThrow(/last project/i);
  });

  test("rejects unsafe project and document ids", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    await expect(
      storage.createProject({
        projectId: "../bad",
        name: "Bad",
        documentId: "document-safe",
        documentName: "Safe"
      })
    ).rejects.toThrow(/safe id/i);

    await expect(
      storage.createProject({
        projectId: "project-safe",
        name: "Safe",
        documentId: "../bad",
        documentName: "Bad"
      })
    ).rejects.toThrow(/safe id/i);
  });

  test("upgrades legacy English sample labels without replacing user geometry", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
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
                        value: ["Canvas", "MCP", "Editor"].join(" "),
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
      value: "Layo"
    });
  });

  test("updates node geometry and persists the document", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

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
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const filled = await storage.setNodeFill("sample-file", "text-1", "#2563eb");
    const text = await storage.updateText("sample-file", "text-1", "저장된 헤드라인");

    expect(filled.style.fill).toBe("#2563eb");
    expect(text.content).toMatchObject({ type: "text", value: "저장된 헤드라인" });
  });

  test("creates a node under a page parent", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

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
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

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
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const inspection = await storage.inspectCanvas("sample-file");
    const matches = await storage.findNodes("sample-file", { text: "Layo" });

    expect(inspection.file.id).toBe("sample-file");
    expect(inspection.nodeCount).toBe(2);
    expect(inspection.pages[0]).toMatchObject({ id: "page-1", name: "페이지 1", nodeCount: 2 });
    expect(inspection.componentCount).toBe(0);
    expect(inspection.validation.issueCount).toBe(0);
    expect(matches.map((node) => node.id)).toEqual(["text-1"]);
    expect(matches[0]).toMatchObject({
      name: "헤드라인",
      kind: "text",
      text: "Layo",
      path: ["page-1", "frame-1", "text-1"]
    });
  });

  test("dry-runs and persists agent command batches with audit summaries", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

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
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const autoLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "vertical",
            align_items: "center",
            justify_content: "space_between",
            gap: 12,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
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
      x: 80,
      y: 20
    });
    expect(autoFrame.children.find((node) => node.id === "layout-rectangle")?.transform).toMatchObject({
      x: 130,
      y: 164
    });
    expect(autoLayout.audit.commandTypes).toEqual(["set_layout", "create_rectangle"]);

    const itemMarginLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "vertical",
            align_items: "start",
            justify_content: "start",
            gap: 12,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "set_layout_item",
          nodeId: "text-1",
          layoutItem: { margin: { top: 10, right: 8, bottom: 14, left: 6 } }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "margin-rectangle",
          name: "마진 사각형",
          width: 120,
          height: 40
        }
      ] as any
    });

    const marginFrame = itemMarginLayout.preview.pages[0].children[0];
    expect(marginFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 26,
      y: 30
    });
    expect(marginFrame.children.find((node) => node.id === "margin-rectangle")?.transform).toMatchObject({
      x: 20,
      y: 104
    });
    expect(itemMarginLayout.audit.commandTypes).toEqual(["set_layout", "set_layout_item", "create_rectangle"]);


    const absoluteItemLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "vertical",
            align_items: "start",
            justify_content: "start",
            gap: 12,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "set_layout_item",
          nodeId: "text-1",
          layoutItem: {
            position: "absolute",
            margin: { top: 10, right: 8, bottom: 14, left: 6 }
          }
        },
        {
          type: "update_geometry",
          nodeId: "text-1",
          x: 140,
          y: 160
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "absolute-flow-rectangle",
          name: "절대 제외 사각형",
          width: 120,
          height: 40
        }
      ] as any
    });

    const absoluteFrame = absoluteItemLayout.preview.pages[0].children[0];
    expect(absoluteFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 140,
      y: 160
    });
    expect(absoluteFrame.children.find((node) => node.id === "absolute-flow-rectangle")?.transform).toMatchObject({
      x: 20,
      y: 20
    });
    expect(absoluteItemLayout.audit.commandTypes).toEqual([
      "set_layout",
      "set_layout_item",
      "update_geometry",
      "create_rectangle"
    ]);

    const wrapLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "update_geometry",
          nodeId: "frame-1",
          width: 180,
          height: 220
        },
        {
          type: "update_geometry",
          nodeId: "text-1",
          width: 90,
          height: 40
        },
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
            gap: 12,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "wrap-rectangle-1",
          name: "줄바꿈 사각형 1",
          width: 90,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "wrap-rectangle-2",
          name: "줄바꿈 사각형 2",
          width: 90,
          height: 40
        }
      ] as any
    });

    const wrapFrame = wrapLayout.preview.pages[0].children[0];
    expect(wrapFrame.layout).toMatchObject({
      wrap: "wrap",
      align_content: "start"
    });
    expect(wrapFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 20,
      y: 20
    });
    expect(wrapFrame.children.find((node) => node.id === "wrap-rectangle-1")?.transform).toMatchObject({
      x: 20,
      y: 72
    });
    expect(wrapFrame.children.find((node) => node.id === "wrap-rectangle-2")?.transform).toMatchObject({
      x: 20,
      y: 124
    });
    expect(wrapLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "create_rectangle",
      "create_rectangle"
    ]);


    const rowColumnGapLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "update_geometry",
          nodeId: "frame-1",
          width: 200,
          height: 220
        },
        {
          type: "update_geometry",
          nodeId: "text-1",
          width: 70,
          height: 40
        },
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
            gap: 12,
            row_gap: 24,
            column_gap: 6,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "gap-rectangle-1",
          name: "간격 사각형 1",
          width: 70,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "gap-rectangle-2",
          name: "간격 사각형 2",
          width: 70,
          height: 40
        }
      ] as any
    });

    const gapFrame = rowColumnGapLayout.preview.pages[0].children[0];
    expect(gapFrame.layout).toMatchObject({
      wrap: "wrap",
      align_content: "start",
      row_gap: 24,
      column_gap: 6
    });
    expect(gapFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 20,
      y: 20
    });
    expect(gapFrame.children.find((node) => node.id === "gap-rectangle-1")?.transform).toMatchObject({
      x: 96,
      y: 20
    });
    expect(gapFrame.children.find((node) => node.id === "gap-rectangle-2")?.transform).toMatchObject({
      x: 20,
      y: 84
    });
    expect(rowColumnGapLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "create_rectangle",
      "create_rectangle"
    ]);


    const fitLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "update_geometry",
          nodeId: "frame-1",
          width: 420,
          height: 280
        },
        {
          type: "update_geometry",
          nodeId: "text-1",
          width: 120,
          height: 40
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "vertical",
            align_items: "start",
            justify_content: "start",
            width_sizing: "fit",
            height_sizing: "fit",
            gap: 12,
            padding: { top: 20, right: 24, bottom: 20, left: 24 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "fit-rectangle-1",
          name: "맞춤 사각형",
          width: 80,
          height: 30
        }
      ] as any
    });

    const fitFrame = fitLayout.preview.pages[0].children[0];
    expect(fitFrame.layout).toMatchObject({
      width_sizing: "fit",
      height_sizing: "fit"
    });
    expect(fitFrame.size).toEqual({ width: 168, height: 122 });
    expect(fitFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 24,
      y: 20
    });
    expect(fitFrame.children.find((node) => node.id === "fit-rectangle-1")?.transform).toMatchObject({
      x: 24,
      y: 72
    });
    expect(fitLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "create_rectangle"
    ]);


    const itemFillLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "update_geometry",
          nodeId: "frame-1",
          width: 360,
          height: 240
        },
        {
          type: "update_geometry",
          nodeId: "text-1",
          width: 100,
          height: 40
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "vertical",
            align_items: "start",
            justify_content: "start",
            gap: 12,
            padding: { top: 20, right: 24, bottom: 20, left: 24 }
          }
        },
        {
          type: "set_layout_item",
          nodeId: "text-1",
          layoutItem: {
            width_sizing: "fill",
            height_sizing: "fill",
            margin: { top: 0, right: 6, bottom: 0, left: 6 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "fill-fixed-rectangle-1",
          name: "고정 사각형",
          width: 80,
          height: 30
        }
      ] as any
    });

    const fillFrame = itemFillLayout.preview.pages[0].children[0];
    const fillText = fillFrame.children.find((node) => node.id === "text-1");
    expect(fillText?.layout_item).toMatchObject({
      width_sizing: "fill",
      height_sizing: "fill",
      margin: { top: 0, right: 6, bottom: 0, left: 6 }
    });
    expect(fillText?.size).toEqual({ width: 300, height: 158 });
    expect(fillText?.transform).toMatchObject({ x: 30, y: 20 });
    expect(fillFrame.children.find((node) => node.id === "fill-fixed-rectangle-1")?.transform).toMatchObject({
      x: 24,
      y: 190
    });
    expect(itemFillLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "set_layout_item",
      "create_rectangle"
    ]);


    const gridLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "update_geometry",
          nodeId: "frame-1",
          width: 360,
          height: 240
        },
        {
          type: "update_geometry",
          nodeId: "text-1",
          width: 80,
          height: 40
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "grid",
            direction: "horizontal",
            grid_columns: 2,
            grid_rows: 2,
            align_items: "start",
            justify_content: "start",
            gap: 0,
            row_gap: 12,
            column_gap: 16,
            padding: { top: 20, right: 24, bottom: 20, left: 24 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "grid-rectangle-1",
          name: "그리드 사각형 1",
          width: 80,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "grid-rectangle-2",
          name: "그리드 사각형 2",
          width: 80,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "grid-rectangle-3",
          name: "그리드 사각형 3",
          width: 80,
          height: 40
        }
      ] as any
    });

    const gridFrame = gridLayout.preview.pages[0].children[0];
    expect(gridFrame.layout).toMatchObject({
      mode: "grid",
      grid_columns: 2,
      grid_rows: 2,
      row_gap: 12,
      column_gap: 16
    });
    expect(gridFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({ x: 24, y: 20 });
    expect(gridFrame.children.find((node) => node.id === "grid-rectangle-1")?.transform).toMatchObject({ x: 188, y: 20 });
    expect(gridFrame.children.find((node) => node.id === "grid-rectangle-2")?.transform).toMatchObject({ x: 24, y: 126 });
    expect(gridFrame.children.find((node) => node.id === "grid-rectangle-3")?.transform).toMatchObject({ x: 188, y: 126 });
    expect(gridLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "create_rectangle",
      "create_rectangle",
      "create_rectangle"
    ]);

    const manualGridLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 390, height: 220 },
        { type: "update_geometry", nodeId: "text-1", width: 80, height: 40 },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "grid",
            direction: "horizontal",
            grid_columns: 3,
            grid_rows: 2,
            align_items: "start",
            justify_content: "start",
            gap: 0,
            row_gap: 10,
            column_gap: 12,
            padding: { top: 20, right: 15, bottom: 20, left: 15 }
          }
        },
        {
          type: "set_layout_item",
          nodeId: "text-1",
          layoutItem: {
            grid_column: 3,
            grid_row: 2,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "manual-grid-rectangle-1",
          name: "수동 그리드 사각형 1",
          width: 80,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "manual-grid-rectangle-2",
          name: "수동 그리드 사각형 2",
          width: 80,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "manual-grid-rectangle-3",
          name: "수동 그리드 사각형 3",
          width: 80,
          height: 40
        }
      ] as any
    });

    const manualGridFrame = manualGridLayout.preview.pages[0].children[0];
    expect(manualGridFrame.children.find((node) => node.id === "text-1")?.layout_item).toMatchObject({
      grid_column: 3,
      grid_row: 2
    });
    expect(manualGridFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({ x: 263, y: 115 });
    expect(manualGridFrame.children.find((node) => node.id === "manual-grid-rectangle-1")?.transform).toMatchObject({ x: 15, y: 20 });
    expect(manualGridFrame.children.find((node) => node.id === "manual-grid-rectangle-2")?.transform).toMatchObject({ x: 139, y: 20 });
    expect(manualGridFrame.children.find((node) => node.id === "manual-grid-rectangle-3")?.transform).toMatchObject({ x: 263, y: 20 });
    expect(manualGridLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "set_layout_item",
      "create_rectangle",
      "create_rectangle",
      "create_rectangle"
    ]);

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

async function storageWithDocument(root: string) {
  const storage = new FileStorage(root);
  await storage.createProject({
    projectId: "test-project",
    name: "테스트 프로젝트",
    documentId: "sample-file",
    documentName: "테스트 문서"
  });
  return storage;
}
