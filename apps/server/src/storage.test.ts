import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { validateDocument as validateDesignFile } from "./agent-control";
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

  test("file versions save snapshots and restore the document with a recovery snapshot", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const version = await storage.saveFileVersion("sample-file", { message: "검토 전" });
    await storage.updateText("sample-file", "text-1", "변경된 헤드라인");

    const changed = await storage.readFile("sample-file");
    expect(findTextValue(changed, "text-1")).toBe("변경된 헤드라인");

    const restored = await storage.restoreFileVersion("sample-file", version.versionId);
    const versions = await storage.listFileVersions("sample-file");
    const savedSnapshot = await storage.readFileVersion("sample-file", version.versionId);

    expect(version).toMatchObject({
      fileId: "sample-file",
      message: "검토 전",
      source: "manual",
      name: "테스트 문서"
    });
    expect(version.nodeCount).toBeGreaterThan(0);
    expect(savedSnapshot.document.id).toBe("sample-file");
    expect(findTextValue(restored.file, "text-1")).toBe("Layo");
    expect(restored.restoredVersion.versionId).toBe(version.versionId);
    expect(restored.recoveryVersion.source).toBe("restore");
    expect(versions.map((item) => item.versionId)).toContain(version.versionId);
    expect(versions.map((item) => item.source)).toContain("restore");
  });

  test("creates an automatic file version after the third persisted edit", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    await storage.updateText("sample-file", "text-1", "자동 변경 1");
    await storage.updateText("sample-file", "text-1", "자동 변경 2");
    expect((await storage.listFileVersions("sample-file")).filter((version) => version.source === "auto")).toEqual([]);

    await storage.updateText("sample-file", "text-1", "자동 변경 3");

    const autoVersions = (await storage.listFileVersions("sample-file")).filter(
      (version) => version.source === "auto"
    );
    expect(autoVersions).toHaveLength(1);
    expect(autoVersions[0]).toMatchObject({
      fileId: "sample-file",
      message: "자동 저장",
      source: "auto",
      name: "테스트 문서"
    });

    const autoSnapshot = await storage.readFileVersion("sample-file", autoVersions[0].versionId);
    expect(findTextValue(autoSnapshot.document, "text-1")).toBe("자동 변경 3");
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

  test("direct geometry updates pin resized fill layout item axes to fixed", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 360, height: 240 },
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
        { type: "update_geometry", nodeId: "text-1", width: 100, height: 40 },
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
          id: "fixed-rectangle-1",
          name: "고정 사각형",
          width: 80,
          height: 30
        }
      ] as any
    });

    const node = await storage.updateNodeGeometry("sample-file", "text-1", { width: 180 });
    const document = await storage.readFile("sample-file");
    const frame = document.pages[0].children[0];
    const text = frame.children.find((child) => child.id === "text-1");

    expect(node.size.width).toBe(180);
    expect(text?.size.width).toBe(180);
    expect(text?.layout_item).toMatchObject({
      height_sizing: "fill",
      margin: { top: 0, right: 6, bottom: 0, left: 6 }
    });
    expect(text?.layout_item?.width_sizing).toBeUndefined();
  });

  test("updates fill and text content", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const filled = await storage.setNodeFill("sample-file", "text-1", "#2563eb");
    const text = await storage.updateText("sample-file", "text-1", "저장된 헤드라인");

    expect(filled.style.fill).toBe("#2563eb");
    expect(text.content).toMatchObject({ type: "text", value: "저장된 헤드라인" });
  });

  test("agent commands create color tokens and bind node fills", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        {
          type: "create_token",
          token: {
            id: "color-brand-primary",
            name: "Brand / Primary",
            type: "color",
            value: "#2563eb"
          }
        },
        { type: "set_fill_token", nodeId: "text-1", tokenId: "color-brand-primary" }
      ] as any
    });
    const persisted = await storage.readFile("sample-file");
    const frame = result.preview.pages[0].children[0];
    const text = frame.children.find((node) => node.id === "text-1");

    expect(result.preview.tokens).toEqual([
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb"
      }
    ]);
    expect(text?.style).toMatchObject({
      fill: "#2563eb",
      fill_token: "color-brand-primary"
    });
    expect(result.validation.issueCount).toBe(0);
    expect(result.audit.commandTypes).toEqual(["create_token", "set_fill_token"]);
    expect(JSON.stringify(persisted)).not.toContain("color-brand-primary");
  });

  test("agent commands create spacing tokens and bind layout gaps and padding", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: {
            id: "spacing-layout-lg",
            name: "Layout / Lg",
            type: "spacing",
            value: "32px"
          }
        },
        {
          type: "set_layout_spacing_token",
          nodeId: "frame-1",
          target: "all_gaps",
          tokenId: "spacing-layout-lg"
        },
        {
          type: "set_layout_spacing_token",
          nodeId: "frame-1",
          target: "all_padding",
          tokenId: "spacing-layout-lg"
        }
      ] as any
    });
    const persisted = await storage.readFile("sample-file");
    const frame = persisted.pages[0].children[0] as any;

    expect(frame.layout).toMatchObject({
      gap: 32,
      row_gap: 32,
      column_gap: 32,
      padding: { top: 32, right: 32, bottom: 32, left: 32 },
      spacing_tokens: {
        gap: "spacing-layout-lg",
        row_gap: "spacing-layout-lg",
        column_gap: "spacing-layout-lg",
        padding_top: "spacing-layout-lg",
        padding_right: "spacing-layout-lg",
        padding_bottom: "spacing-layout-lg",
        padding_left: "spacing-layout-lg"
      }
    });
    expect(result.validation.issueCount).toBe(0);
    expect(result.audit.commandTypes).toEqual([
      "create_token",
      "set_layout_spacing_token",
      "set_layout_spacing_token"
    ]);
  });

  test("validates missing and wrong-type layout spacing token references", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const document = await storage.readFile("sample-file");
    document.tokens = [
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb"
      }
    ];
    document.pages[0].children[0].layout = {
      mode: "auto",
      direction: "vertical",
      align_items: "start",
      justify_content: "start",
      gap: 12,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      spacing_tokens: {
        gap: "missing-spacing",
        padding_top: "color-brand-primary"
      }
    } as any;

    const validation = validateDesignFile(document as any);

    expect(validation.issues.map((issue) => issue.code)).toContain("missing_layout_spacing_token");
    expect(validation.issues.map((issue) => issue.code)).toContain("invalid_layout_spacing_token_type");
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

  test("change summary reports changed descendants without duplicate parent updates", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const before = await storage.readFile("sample-file");

    await storage.updateText("sample-file", "text-1", "변경된 헤드라인");
    const after = await storage.readFile("sample-file");
    const summary = await storage.getChangeSummary("sample-file", before, after);

    expect(summary.updatedNodeIds).toEqual(["text-1"]);
    expect(summary.changedNodeIds).toEqual(["text-1"]);
    expect(summary.updatedNodeIds).not.toContain("frame-1");
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

    const reverseRowLayout = await storage.applyAgentCommands("sample-file", {
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
          width: 260,
          height: 48
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "horizontal_reverse",
            align_items: "start",
            justify_content: "start",
            gap: 12,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "reverse-row-rectangle",
          name: "역방향 행 사각형",
          width: 80,
          height: 30
        }
      ] as any
    });

    const reverseRowFrame = reverseRowLayout.preview.pages[0].children[0];
    expect(reverseRowFrame.layout).toMatchObject({ direction: "horizontal_reverse" });
    expect(reverseRowFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 140,
      y: 20
    });
    expect(reverseRowFrame.children.find((node) => node.id === "reverse-row-rectangle")?.transform).toMatchObject({
      x: 48,
      y: 20
    });
    expect(reverseRowLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "create_rectangle"
    ]);

    const reverseColumnLayout = await storage.applyAgentCommands("sample-file", {
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
          width: 260,
          height: 48
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "vertical_reverse",
            align_items: "start",
            justify_content: "start",
            gap: 12,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "reverse-column-rectangle",
          name: "역방향 열 사각형",
          width: 80,
          height: 30
        }
      ] as any
    });

    const reverseColumnFrame = reverseColumnLayout.preview.pages[0].children[0];
    expect(reverseColumnFrame.layout).toMatchObject({ direction: "vertical_reverse" });
    expect(reverseColumnFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
      x: 20,
      y: 212
    });
    expect(reverseColumnFrame.children.find((node) => node.id === "reverse-column-rectangle")?.transform).toMatchObject({
      x: 20,
      y: 170
    });
    expect(reverseColumnLayout.audit.commandTypes).toEqual([
      "update_geometry",
      "update_geometry",
      "set_layout",
      "create_rectangle"
    ]);

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

    const minMaxLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 420, height: 280 },
        { type: "update_geometry", nodeId: "text-1", width: 260, height: 40 },
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
            min_width: 220,
            max_width: 240,
            min_height: 160,
            max_height: 170,
            gap: 12,
            padding: { top: 20, right: 24, bottom: 20, left: 24 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "min-max-rectangle-1",
          name: "최소 최대 사각형",
          width: 80,
          height: 30
        }
      ] as any
    });

    const minMaxFrame = minMaxLayout.preview.pages[0].children[0];
    expect(minMaxFrame.layout).toMatchObject({
      min_width: 220,
      max_width: 240,
      min_height: 160,
      max_height: 170
    });
    expect(minMaxFrame.size).toEqual({ width: 240, height: 160 });

    const minMaxItemLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 360, height: 240 },
        { type: "update_geometry", nodeId: "text-1", width: 100, height: 40 },
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
            max_width: 180,
            min_height: 100,
            max_height: 120,
            margin: { top: 0, right: 6, bottom: 0, left: 6 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "min-max-fill-rectangle-1",
          name: "채우기 제한 사각형",
          width: 80,
          height: 30
        }
      ] as any
    });

    const minMaxItemFrame = minMaxItemLayout.preview.pages[0].children[0];
    const minMaxText = minMaxItemFrame.children.find((node) => node.id === "text-1");
    expect(minMaxText?.layout_item).toMatchObject({
      width_sizing: "fill",
      height_sizing: "fill",
      max_width: 180,
      min_height: 100,
      max_height: 120
    });
    expect(minMaxText?.size).toEqual({ width: 180, height: 120 });
    expect(minMaxText?.transform).toMatchObject({ x: 30, y: 20 });
    expect(minMaxItemFrame.children.find((node) => node.id === "min-max-fill-rectangle-1")?.transform).toMatchObject({
      x: 24,
      y: 152
    });


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

    const gridBaselineLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 300, height: 180 },
        { type: "update_geometry", nodeId: "text-1", width: 90, height: 48 },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "label-1",
          name: "라벨",
          value: "Label",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "subtitle-1",
          name: "서브타이틀",
          value: "Sub",
          x: 0,
          y: 0,
          width: 90,
          height: 48,
          fill: "#111827",
          fontSize: 32,
          fontFamily: "Inter"
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "grid",
            direction: "horizontal",
            grid_columns: 2,
            grid_rows: 2,
            align_items: "baseline",
            justify_content: "start",
            gap: 0,
            row_gap: 20,
            column_gap: 0,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        }
      ] as any
    });

    const gridBaselineFrame = gridBaselineLayout.preview.pages[0].children[0];
    const baselineTitle = gridBaselineFrame.children.find((node) => node.id === "text-1");
    const baselineCaption = gridBaselineFrame.children.find((node) => node.id === "caption-1");
    const baselineLabel = gridBaselineFrame.children.find((node) => node.id === "label-1");
    const baselineSubtitle = gridBaselineFrame.children.find((node) => node.id === "subtitle-1");
    expect(gridBaselineFrame.layout).toMatchObject({ mode: "grid", align_items: "baseline" });
    expect(baselineTitle?.transform).toMatchObject({ x: 20, y: 20 });
    expect(baselineCaption?.transform).toMatchObject({ x: 150, y: 29 });
    expect(baselineLabel?.transform).toMatchObject({ x: 20, y: 113 });
    expect(baselineSubtitle?.transform).toMatchObject({ x: 150, y: 100 });

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

    const spannedGridLayout = await storage.applyAgentCommands("sample-file", {
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
            grid_column: 1,
            grid_row: 1,
            grid_column_span: 2,
            grid_row_span: 2,
            width_sizing: "fill",
            height_sizing: "fill",
            margin: { top: 5, right: 6, bottom: 7, left: 8 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "spanned-grid-rectangle-1",
          name: "범위 그리드 사각형 1",
          width: 80,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "spanned-grid-rectangle-2",
          name: "범위 그리드 사각형 2",
          width: 80,
          height: 40
        }
      ] as any
    });

    const spannedGridFrame = spannedGridLayout.preview.pages[0].children[0];
    expect(spannedGridFrame.children.find((node) => node.id === "text-1")?.layout_item).toMatchObject({
      grid_column: 1,
      grid_row: 1,
      grid_column_span: 2,
      grid_row_span: 2
    });
    expect(spannedGridFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({ x: 23, y: 25 });
    expect(spannedGridFrame.children.find((node) => node.id === "text-1")?.size).toEqual({ width: 222, height: 168 });
    expect(spannedGridFrame.children.find((node) => node.id === "spanned-grid-rectangle-1")?.transform).toMatchObject({
      x: 263,
      y: 20
    });
    expect(spannedGridFrame.children.find((node) => node.id === "spanned-grid-rectangle-2")?.transform).toMatchObject({
      x: 263,
      y: 115
    });

    const trackGridLayout = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 500, height: 260 },
        { type: "update_geometry", nodeId: "text-1", width: 80, height: 40 },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "grid",
            direction: "horizontal",
            grid_columns: 3,
            grid_rows: 2,
            grid_column_tracks: [
              { type: "px", value: 120 },
              { type: "fr", value: 2 },
              { type: "fr", value: 1 }
            ],
            grid_row_tracks: [
              { type: "px", value: 80 },
              { type: "fr", value: 1 }
            ],
            align_items: "start",
            justify_content: "start",
            gap: 0,
            row_gap: 10,
            column_gap: 10,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "track-grid-rectangle-1",
          name: "트랙 그리드 사각형 1",
          width: 80,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "track-grid-rectangle-2",
          name: "트랙 그리드 사각형 2",
          width: 80,
          height: 40
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "track-grid-rectangle-3",
          name: "트랙 그리드 사각형 3",
          width: 80,
          height: 40
        }
      ] as any
    });

    const trackGridFrame = trackGridLayout.preview.pages[0].children[0];
    expect(trackGridFrame.layout).toMatchObject({
      mode: "grid",
      grid_columns: 3,
      grid_rows: 2,
      grid_column_tracks: [
        { type: "px", value: 120 },
        { type: "fr", value: 2 },
        { type: "fr", value: 1 }
      ],
      grid_row_tracks: [{ type: "px", value: 80 }, { type: "fr", value: 1 }]
    });
    expect(trackGridFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({ x: 20, y: 20 });
    expect(trackGridFrame.children.find((node) => node.id === "track-grid-rectangle-1")?.transform).toMatchObject({
      x: 150,
      y: 20
    });
    expect(trackGridFrame.children.find((node) => node.id === "track-grid-rectangle-2")?.transform.x).toBeCloseTo(
      373.33,
      1
    );
    expect(trackGridFrame.children.find((node) => node.id === "track-grid-rectangle-2")?.transform.y).toBe(20);
    expect(trackGridFrame.children.find((node) => node.id === "track-grid-rectangle-3")?.transform).toMatchObject({
      x: 20,
      y: 110
    });

    const areaGridLayout = await storage.applyAgentCommands("sample-file", {
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
            grid_areas: [{ name: "hero", column: 2, row: 1, column_span: 2, row_span: 2 }],
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
            grid_area: "hero",
            width_sizing: "fill",
            height_sizing: "fill",
            margin: { top: 5, right: 6, bottom: 7, left: 8 }
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "area-grid-rectangle-1",
          name: "영역 그리드 사각형 1",
          width: 80,
          height: 40
        }
      ] as any
    });

    const areaGridFrame = areaGridLayout.preview.pages[0].children[0];
    expect(areaGridFrame.layout).toMatchObject({
      mode: "grid",
      grid_areas: [{ name: "hero", column: 2, row: 1, column_span: 2, row_span: 2 }]
    });
    expect(areaGridFrame.children.find((node) => node.id === "text-1")?.layout_item).toMatchObject({
      grid_area: "hero"
    });
    expect(areaGridFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({ x: 147, y: 25 });
    expect(areaGridFrame.children.find((node) => node.id === "text-1")?.size).toEqual({ width: 222, height: 168 });
    expect(areaGridFrame.children.find((node) => node.id === "area-grid-rectangle-1")?.transform).toMatchObject({
      x: 15,
      y: 20
    });

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

  test("agent commands apply grid justify_items stretch deterministically", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 320, height: 140 },
        { type: "update_geometry", nodeId: "text-1", width: 40, height: 40 },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "grid",
            direction: "horizontal",
            grid_columns: 2,
            grid_rows: 1,
            align_items: "start",
            justify_content: "start",
            justify_items: "stretch",
            gap: 0,
            row_gap: 0,
            column_gap: 0,
            padding: { top: 10, right: 10, bottom: 10, left: 10 }
          }
        }
      ] as any
    });

    const frame = result.preview.pages[0].children[0];
    const text = frame.children.find((node) => node.id === "text-1");
    expect(frame.layout).toMatchObject({
      mode: "grid",
      justify_items: "stretch"
    });
    expect(text?.transform).toMatchObject({ x: 10, y: 10 });
    expect(text?.size).toEqual({ width: 150, height: 40 });
  });

  test("agent commands apply grid item self alignment deterministically", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 320, height: 160 },
        { type: "update_geometry", nodeId: "text-1", width: 40, height: 40 },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "grid",
            direction: "horizontal",
            grid_columns: 2,
            grid_rows: 1,
            align_items: "start",
            justify_content: "start",
            justify_items: "start",
            gap: 0,
            row_gap: 0,
            column_gap: 0,
            padding: { top: 10, right: 10, bottom: 10, left: 10 }
          }
        },
        {
          type: "set_layout_item",
          nodeId: "text-1",
          layoutItem: {
            justify_self: "stretch",
            align_self: "stretch",
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
          }
        }
      ] as any
    });

    const frame = result.preview.pages[0].children[0];
    const text = frame.children.find((node) => node.id === "text-1");
    expect(text?.layout_item).toMatchObject({
      justify_self: "stretch",
      align_self: "stretch"
    });
    expect(text?.transform).toMatchObject({ x: 10, y: 10 });
    expect(text?.size).toEqual({ width: 150, height: 140 });
  });

  test("agent commands apply flex baseline alignment deterministically", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 360, height: 140 },
        { type: "update_geometry", nodeId: "text-1", width: 120, height: 48 },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "horizontal",
            align_items: "baseline",
            justify_content: "start",
            gap: 10,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        }
      ] as any
    });

    const frame = result.preview.pages[0].children[0];
    const title = frame.children.find((node) => node.id === "text-1");
    const caption = frame.children.find((node) => node.id === "caption-1");
    expect(frame.layout).toMatchObject({ mode: "auto", align_items: "baseline" });
    expect(title?.transform).toMatchObject({ x: 20, y: 20 });
    expect(caption?.transform).toMatchObject({ x: 150, y: 29 });
  });

  test("agent commands apply wrapped flex baseline alignment per line", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: true,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 240, height: 180 },
        { type: "update_geometry", nodeId: "text-1", width: 90, height: 48 },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "label-1",
          name: "라벨",
          value: "Label",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "subtitle-1",
          name: "서브타이틀",
          value: "Sub",
          x: 0,
          y: 0,
          width: 90,
          height: 48,
          fill: "#111827",
          fontSize: 32,
          fontFamily: "Inter"
        },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "horizontal",
            wrap: "wrap",
            align_content: "start",
            align_items: "baseline",
            justify_content: "start",
            gap: 10,
            row_gap: 12,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        }
      ] as any
    });

    const frame = result.preview.pages[0].children[0];
    const title = frame.children.find((node) => node.id === "text-1");
    const caption = frame.children.find((node) => node.id === "caption-1");
    const label = frame.children.find((node) => node.id === "label-1");
    const subtitle = frame.children.find((node) => node.id === "subtitle-1");
    expect(frame.layout).toMatchObject({ mode: "auto", wrap: "wrap", align_items: "baseline" });
    expect(title?.transform).toMatchObject({ x: 20, y: 20 });
    expect(caption?.transform).toMatchObject({ x: 120, y: 29 });
    expect(label?.transform).toMatchObject({ x: 20, y: 93 });
    expect(subtitle?.transform).toMatchObject({ x: 110, y: 80 });
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

function findTextValue(document: Awaited<ReturnType<FileStorage["readFile"]>>, nodeId: string) {
  const stack = document.pages.flatMap((page) => page.children);
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) {
      continue;
    }
    if (node.id === nodeId && node.content.type === "text") {
      return node.content.value;
    }
    stack.push(...node.children);
  }
  return null;
}
