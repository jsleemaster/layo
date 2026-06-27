import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
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

  test("pins file versions and sorts pinned checkpoints first", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const first = await storage.saveFileVersion("sample-file", { message: "검토 전" });
    await storage.updateText("sample-file", "text-1", "릴리즈 검토 대상");
    const second = await storage.saveFileVersion("sample-file", { message: "릴리즈 전" });

    await expect(storage.setFileVersionPinned("sample-file", first.versionId, true)).resolves.toMatchObject({
      versionId: first.versionId,
      pinned: true
    });

    const versions = await storage.listFileVersions("sample-file");
    expect(versions[0]).toMatchObject({ versionId: first.versionId, pinned: true });
    expect(versions.find((version) => version.versionId === second.versionId)).toMatchObject({
      pinned: false
    });
    await expect(storage.readFileVersion("sample-file", first.versionId)).resolves.toMatchObject({
      pinned: true
    });
  });

  test("file version retention deletes pinned versions manually and prunes only old unpinned versions", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const manuallyDeleted = await storage.saveFileVersion("sample-file", { message: "삭제할 고정 버전" });
    await storage.setFileVersionPinned("sample-file", manuallyDeleted.versionId, true);
    await expect(storage.deleteFileVersion("sample-file", manuallyDeleted.versionId)).resolves.toMatchObject({
      versionId: manuallyDeleted.versionId,
      pinned: true,
      deleted: true
    });
    expect((await storage.listFileVersions("sample-file")).map((version) => version.versionId)).not.toContain(
      manuallyDeleted.versionId
    );

    const protectedVersion = await storage.saveFileVersion("sample-file", { message: "릴리즈 기준" });
    await storage.setFileVersionPinned("sample-file", protectedVersion.versionId, true);
    const oldVersion = await storage.saveFileVersion("sample-file", { message: "오래된 작업" });
    await storage.updateText("sample-file", "text-1", "최신 작업");
    const newestVersion = await storage.saveFileVersion("sample-file", { message: "최신 작업" });

    const pruned = await storage.pruneFileVersions("sample-file", { keepUnpinned: 1 });
    expect(pruned).toMatchObject({ fileId: "sample-file", keepUnpinned: 1 });
    expect(pruned.deletedVersions).toEqual([
      expect.objectContaining({ versionId: oldVersion.versionId, pinned: false })
    ]);

    const versions = await storage.listFileVersions("sample-file");
    expect(versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ versionId: protectedVersion.versionId, pinned: true }),
        expect.objectContaining({ versionId: newestVersion.versionId, pinned: false })
      ])
    );
    expect(versions.map((version) => version.versionId)).not.toContain(oldVersion.versionId);
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

  test("file archive export imports a design file with referenced image assets", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const source = await storageWithDocument(path.join(tempRoot, "source"));
    const pixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const asset = await source.createAsset({
      name: "pixel.png",
      mimeType: "image/png",
      dataBase64: pixelPng
    });
    await source.createNode("sample-file", "page-1", {
      id: "image-archive-1",
      kind: "image",
      name: "아카이브 이미지",
      transform: { x: 120, y: 140, rotation: 0 },
      size: { width: 320, height: 200 },
      style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
      content: {
        type: "image",
        asset_id: asset.assetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fit"
      },
      children: []
    });

    const exported = await source.exportFileArchive("sample-file");

    expect(exported).toMatchObject({
      fileId: "sample-file",
      name: "테스트 문서",
      assetCount: 1,
      mimeType: "application/vnd.layo.file-archive+zip"
    });
    expect(exported.archive.subarray(0, 2).toString("utf8")).toBe("PK");

    const target = new FileStorage(path.join(tempRoot, "target"));
    const imported = await target.importFileArchive(exported.archive, {
      fileId: "imported-file",
      name: "가져온 문서"
    });

    expect(imported).toMatchObject({
      fileId: "imported-file",
      name: "가져온 문서",
      originalFileId: "sample-file",
      assetCount: 1
    });
    const document = await target.readFile("imported-file");
    const image = findImageNode(document, "image-archive-1");
    expect(image?.content).toMatchObject({
      type: "image",
      asset_id: asset.assetId,
      fit_mode: "fit"
    });
    const importedAsset = await target.readAsset(asset.assetId);
    expect(importedAsset).toMatchObject({
      assetId: asset.assetId,
      name: "pixel.png",
      mimeType: "image/png"
    });
    expect(importedAsset.data.equals(Buffer.from(pixelPng, "base64"))).toBe(true);
  });

  test("reviews a file archive without writing the imported file", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const source = await storageWithDocument(path.join(tempRoot, "source"));
    const exported = await source.exportFileArchive("sample-file");
    const target = new FileStorage(path.join(tempRoot, "target"));

    const review = await target.reviewFileArchive(exported.archive);

    expect(review).toMatchObject({
      originalFileId: "sample-file",
      originalName: "테스트 문서",
      suggestedName: "테스트 문서",
      assetCount: 0,
      pageCount: 1,
      nodeCount: expect.any(Number)
    });
    expect(review.nodeCount).toBeGreaterThan(0);
    await expect(target.readFile("sample-file")).rejects.toThrow();
  });

  test("project archive export reviews and imports all documents with referenced assets", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const source = await storageWithDocument(path.join(tempRoot, "source"));
    const pixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const asset = await source.createAsset({
      name: "pixel.png",
      mimeType: "image/png",
      dataBase64: pixelPng
    });
    await source.createNode("sample-file", "page-1", {
      id: "project-archive-image",
      kind: "image",
      name: "프로젝트 이미지",
      transform: { x: 80, y: 120, rotation: 0 },
      size: { width: 120, height: 90 },
      style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
      content: {
        type: "image",
        asset_id: asset.assetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fit"
      },
      children: []
    });
    await source.createProjectDocument("test-project", {
      documentId: "second-file",
      name: "두 번째 문서"
    });

    const exported = await source.exportProjectArchive("test-project");
    expect(exported).toMatchObject({
      projectId: "test-project",
      name: "테스트 프로젝트",
      documentCount: 2,
      assetCount: 1,
      mimeType: "application/vnd.layo.project-archive+zip"
    });
    expect(exported.archive.subarray(0, 2).toString("utf8")).toBe("PK");

    const target = new FileStorage(path.join(tempRoot, "target"));
    const review = await target.reviewProjectArchive(exported.archive);
    expect(review).toMatchObject({
      originalProjectId: "test-project",
      originalName: "테스트 프로젝트",
      suggestedName: "테스트 프로젝트",
      documentCount: 2,
      assetCount: 1,
      documents: [
        expect.objectContaining({ originalFileId: "sample-file", originalName: "테스트 문서" }),
        expect.objectContaining({ originalFileId: "second-file", originalName: "두 번째 문서" })
      ]
    });
    await expect(target.readProject("test-project")).rejects.toThrow();

    const imported = await target.importProjectArchive(exported.archive, {
      projectId: "imported-project",
      name: "복원 프로젝트",
      documentIdPrefix: "restored"
    });
    expect(imported).toMatchObject({
      originalProjectId: "test-project",
      originalName: "테스트 프로젝트",
      documentCount: 2,
      assetCount: 1
    });
    expect(imported.project).toMatchObject({
      projectId: "imported-project",
      name: "복원 프로젝트",
      currentDocumentId: "restored-second-file",
      sharing: { mode: "private" }
    });
    expect(imported.documentIdMap).toEqual({
      "sample-file": "restored-sample-file",
      "second-file": "restored-second-file"
    });
    expect((await target.readProject("imported-project")).documents.map((item) => item.documentId)).toEqual([
      "restored-sample-file",
      "restored-second-file"
    ]);
    expect((await target.readFile("restored-sample-file")).id).toBe("restored-sample-file");
    expect(findImageNode(await target.readFile("restored-sample-file"), "project-archive-image")?.content).toMatchObject(
      {
        type: "image",
        asset_id: asset.assetId
      }
    );
    expect((await target.readAsset(asset.assetId)).data.equals(Buffer.from(pixelPng, "base64"))).toBe(true);
  });

  test("library archive exports reviews and imports components tokens and assets without overwriting ids", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const source = await storageWithDocument(path.join(tempRoot, "source"));
    const target = await storageWithDocument(path.join(tempRoot, "target"));
    const pixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const asset = await source.createAsset({
      name: "library.png",
      mimeType: "image/png",
      dataBase64: pixelPng
    });

    await source.applyAgentCommands("sample-file", {
      dryRun: false,
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
        {
          type: "create_token",
          token: {
            id: "spacing-card-gap",
            name: "Spacing / Card Gap",
            type: "spacing",
            value: "24px"
          }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-card",
          name: "Library Card",
          width: 160,
          height: 96,
          fill: "#ffffff"
        },
        { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
        {
          type: "create_component",
          nodeId: "library-card",
          componentId: "component-card",
          name: "Card"
        }
      ] as any
    });
    await source.createNode("sample-file", "page-1", {
      id: "library-image",
      kind: "image",
      name: "Library Image",
      transform: { x: 60, y: 80, rotation: 0 },
      size: { width: 20, height: 20 },
      style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
      content: {
        type: "image",
        asset_id: asset.assetId,
        natural_width: 1,
        natural_height: 1,
        fit_mode: "fit"
      },
      children: []
    });
    await source.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_component",
          nodeId: "library-image",
          componentId: "component-image",
          name: "Image Tile"
        }
      ] as any
    });
    await target.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: {
            id: "color-brand-primary",
            name: "Existing Brand",
            type: "color",
            value: "#111827"
          }
        }
      ] as any
    });

    const exported = await source.exportLibraryArchive("sample-file");
    expect(exported).toMatchObject({
      fileId: "sample-file",
      name: "테스트 문서",
      componentCount: 2,
      tokenCount: 2,
      assetCount: 1,
      mimeType: "application/vnd.layo.library-archive+zip",
      fileName: "sample-file.layo-library.zip"
    });
    expect(exported.archive.subarray(0, 2).toString("utf8")).toBe("PK");

    const review = await target.reviewLibraryArchive("sample-file", exported.archive);
    expect(review).toMatchObject({
      originalFileId: "sample-file",
      originalName: "테스트 문서",
      componentCount: 2,
      tokenCount: 2,
      assetCount: 1,
      components: [
        expect.objectContaining({
          originalComponentId: "component-card",
          name: "Card",
          conflict: false
        }),
        expect.objectContaining({
          originalComponentId: "component-image",
          name: "Image Tile",
          conflict: false
        })
      ],
      tokens: [
        expect.objectContaining({
          originalTokenId: "color-brand-primary",
          name: "Brand / Primary",
          conflict: true
        }),
        expect.objectContaining({
          originalTokenId: "spacing-card-gap",
          name: "Spacing / Card Gap",
          conflict: false
        })
      ]
    });
    expect((await target.readFile("sample-file")).components ?? []).toEqual([]);

    const imported = await target.importLibraryArchive("sample-file", exported.archive, {
      idPrefix: "shared"
    });
    expect(imported).toMatchObject({
      fileId: "sample-file",
      originalFileId: "sample-file",
      componentCount: 2,
      tokenCount: 2,
      assetCount: 1,
      componentIdMap: {
        "component-card": "shared-component-card",
        "component-image": "shared-component-image"
      },
      tokenIdMap: {
        "color-brand-primary": "shared-color-brand-primary",
        "spacing-card-gap": "spacing-card-gap"
      }
    });

    const targetDocument = await target.readFile("sample-file");
    expect(targetDocument.tokens?.map((token) => [token.id, token.value])).toEqual([
      ["color-brand-primary", "#111827"],
      ["shared-color-brand-primary", "#2563eb"],
      ["spacing-card-gap", "24px"]
    ]);
    expect(targetDocument.components?.map((component) => component.id)).toEqual([
      "shared-component-card",
      "shared-component-image"
    ]);
    expect(targetDocument.components?.[0].source_node.style.fill_token).toBe("shared-color-brand-primary");
    expect(targetDocument.components?.[1].source_node.content).toMatchObject({
      type: "image",
      asset_id: asset.assetId
    });
    expect((await target.readAsset(asset.assetId)).data.equals(Buffer.from(pixelPng, "base64"))).toBe(true);
  });

  test("comment threads are stored beside the design file and can be resolved", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "문구 확인 필요",
      authorName: "디자인 팀"
    });

    expect(created).toMatchObject({
      schemaVersion: 1,
      fileId: "sample-file",
      nodeId: "text-1",
      nodeName: "헤드라인",
      body: "문구 확인 필요",
      authorName: "디자인 팀",
      replies: [],
      resolvedAt: null
    });
    expect(created.threadId).toMatch(/^comment-/);
    expect(await storage.listCommentThreads("sample-file")).toEqual([created]);

    const sidecar = JSON.parse(await readFile(path.join(tempRoot, "comments", "sample-file.json"), "utf8"));
    expect(sidecar.threads).toHaveLength(1);
    expect((await storage.readFile("sample-file")) as { comments?: unknown }).not.toHaveProperty("comments");

    const resolved = await storage.resolveCommentThread("sample-file", created.threadId);
    expect(resolved).toMatchObject({
      threadId: created.threadId,
      resolvedAt: expect.any(String)
    });
    expect(await storage.listCommentThreads("sample-file")).toEqual([]);
    expect(await storage.listCommentThreads("sample-file", { includeResolved: true })).toHaveLength(1);
  });

  test("comment threads keep replies in the sidecar store", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "문구 확인 필요",
      authorName: "디자인 팀"
    });
    const replied = await storage.addCommentReply("sample-file", created.threadId, {
      body: "문구를 더 짧게 줄였어요",
      authorName: "개발 팀"
    });

    expect(replied.replies).toHaveLength(1);
    expect(replied.replies[0]).toMatchObject({
      schemaVersion: 1,
      body: "문구를 더 짧게 줄였어요",
      authorName: "개발 팀",
      createdAt: expect.any(String)
    });
    expect(replied.replies[0].replyId).toMatch(/^reply-/);
    expect(await storage.listCommentThreads("sample-file")).toEqual([replied]);

    const sidecar = JSON.parse(await readFile(path.join(tempRoot, "comments", "sample-file.json"), "utf8"));
    expect(sidecar.threads[0].replies.map((reply: { body: string }) => reply.body)).toEqual([
      "문구를 더 짧게 줄였어요"
    ]);
  });

  test("comment threads extract mentions and track unread readers per viewer", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "@민지 @dev-team 문구 확인 필요",
      authorName: "디자인 팀"
    });

    expect(created).toMatchObject({
      mentions: ["민지", "dev-team"],
      readBy: ["디자인 팀"]
    });
    await expect(storage.listCommentThreads("sample-file", { viewerId: "사용자" })).resolves.toEqual([
      expect.objectContaining({
        threadId: created.threadId,
        unread: true
      })
    ]);

    const read = await storage.markCommentThreadRead("sample-file", created.threadId, {
      viewerId: "사용자"
    });
    expect(read).toMatchObject({
      readBy: ["디자인 팀", "사용자"],
      unread: false
    });
    await expect(storage.listCommentThreads("sample-file", { viewerId: "사용자" })).resolves.toEqual([
      expect.objectContaining({
        threadId: created.threadId,
        unread: false
      })
    ]);

    const replied = await storage.addCommentReply("sample-file", created.threadId, {
      body: "@민지 수정했어요",
      authorName: "개발 팀"
    });
    expect(replied).toMatchObject({
      readBy: ["개발 팀"],
      replies: [
        expect.objectContaining({
          mentions: ["민지"]
        })
      ]
    });
    await expect(storage.listCommentThreads("sample-file", { viewerId: "사용자" })).resolves.toEqual([
      expect.objectContaining({
        threadId: created.threadId,
        unread: true
      })
    ]);
  });

  test("comment threads persist structured team mention targets", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const target = { userId: "minji", displayName: "민지", role: "editor" } as const;

    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "@민지 문구 확인 필요",
      authorName: "디자인 팀",
      mentionTargets: [target]
    });
    expect(created).toMatchObject({
      mentions: ["민지"],
      mentionTargets: [target]
    });

    const replied = await storage.addCommentReply("sample-file", created.threadId, {
      body: "@minji 반영했어요",
      authorName: "개발 팀",
      mentionTargets: [target]
    });
    expect(replied.replies[0]).toMatchObject({
      mentions: ["minji"],
      mentionTargets: [target]
    });

    const activity = await storage.listCommentActivity({ viewerId: "사용자", limit: 10 });
    expect(activity.events.map((event) => event.mentionTargets)).toEqual([[target], [target]]);

    const sidecar = JSON.parse(await readFile(path.join(tempRoot, "comments", "sample-file.json"), "utf8"));
    expect(sidecar.threads[0].mentionTargets).toEqual([target]);
    expect(sidecar.threads[0].replies[0].mentionTargets).toEqual([target]);
    expect(sidecar.activity[0].mentionTargets).toEqual([target]);
  });

  test("comment notifications summarize unread threads by project file and mark a file read", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    const viewerTarget = { userId: "사용자", displayName: "사용자", role: "editor" as const };

    await storage.createProject({
      projectId: "project-alpha",
      name: "알파 프로젝트",
      documentId: "document-alpha",
      documentName: "알파 문서"
    });
    await storage.createProjectDocument("project-alpha", {
      documentId: "document-beta",
      name: "베타 문서"
    });
    await storage.createProject({
      projectId: "project-bravo",
      name: "브라보 프로젝트",
      documentId: "document-bravo",
      documentName: "브라보 문서"
    });

    await storage.createCommentThread("document-alpha", {
      nodeId: "text-1",
      body: "@민지 알파 문서 확인 필요",
      authorName: "디자인 팀",
      mentionTargets: [viewerTarget]
    });
    const beta = await storage.createCommentThread("document-beta", {
      nodeId: "text-1",
      body: "베타 문서는 이미 읽음",
      authorName: "디자인 팀"
    });
    await storage.markCommentThreadRead("document-beta", beta.threadId, { viewerId: "사용자" });
    const resolved = await storage.createCommentThread("document-alpha", {
      nodeId: "text-1",
      body: "해결된 코멘트는 알림에서 제외",
      authorName: "디자인 팀"
    });
    await storage.resolveCommentThread("document-alpha", resolved.threadId);
    await storage.createCommentThread("document-bravo", {
      nodeId: "text-1",
      body: "브라보 문서 확인 필요",
      authorName: "디자인 팀"
    });

    await expect(storage.listCommentNotifications({ viewerId: "사용자" })).resolves.toMatchObject({
      viewerId: "사용자",
      totalUnread: 2,
      totalMentions: 1,
      projects: [
        {
          projectId: "project-bravo",
          name: "브라보 프로젝트",
          unreadCount: 1,
          mentionCount: 0,
          files: [{ fileId: "document-bravo", name: "브라보 문서", unreadCount: 1, mentionCount: 0 }]
        },
        {
          projectId: "project-alpha",
          name: "알파 프로젝트",
          unreadCount: 1,
          mentionCount: 1,
          files: [{ fileId: "document-alpha", name: "알파 문서", unreadCount: 1, mentionCount: 1 }]
        }
      ]
    });

    await storage.markFileCommentsRead("document-alpha", { viewerId: "사용자" });

    await expect(storage.listCommentNotifications({ viewerId: "사용자" })).resolves.toMatchObject({
      viewerId: "사용자",
      totalUnread: 1,
      totalMentions: 0,
      projects: [
        {
          projectId: "project-bravo",
          unreadCount: 1,
          mentionCount: 0,
          files: [{ fileId: "document-bravo", unreadCount: 1, mentionCount: 0 }]
        }
      ]
    });
  });

  test("comment notifications order projects by latest unread comment activity", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);

    await storage.createProject({
      projectId: "project-old",
      name: "오래된 프로젝트",
      documentId: "document-old",
      documentName: "오래된 문서"
    });
    await storage.createProject({
      projectId: "project-new",
      name: "최신 프로젝트",
      documentId: "document-new",
      documentName: "최신 문서"
    });
    await storage.updateProject("project-old", { name: "오래된 프로젝트 수정됨" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      await storage.createCommentThread("document-old", {
        nodeId: "text-1",
        body: "먼저 만든 알림",
        authorName: "디자인 팀"
      });
      await storage.createCommentThread("document-new", {
        nodeId: "text-1",
        body: "나중에 만든 알림",
        authorName: "디자인 팀"
      });
    } finally {
      vi.useRealTimers();
    }

    const summary = await storage.listCommentNotifications({ viewerId: "사용자" });

    expect(summary.projects.map((project) => project.projectId)).toEqual([
      "project-new",
      "project-old"
    ]);
  });

  test("comment activity feed retains project file events in recent order", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "@민지 첫 검수 요청",
      authorName: "디자인 팀"
    });
    await storage.addCommentReply("sample-file", created.threadId, {
      body: "문구를 더 짧게 줄였어요",
      authorName: "개발 팀"
    });
    await storage.resolveCommentThread("sample-file", created.threadId);

    await expect(storage.listCommentActivity({ viewerId: "사용자", limit: 2 })).resolves.toMatchObject({
      viewerId: "사용자",
      events: [
        {
          type: "resolved",
          projectId: "test-project",
          projectName: "테스트 프로젝트",
          fileId: "sample-file",
          fileName: "테스트 문서",
          threadId: created.threadId,
          nodeId: "text-1",
          nodeName: "헤드라인",
          actorName: "사용자",
          body: "@민지 첫 검수 요청",
          mentions: ["민지"]
        },
        {
          type: "replied",
          projectId: "test-project",
          projectName: "테스트 프로젝트",
          fileId: "sample-file",
          fileName: "테스트 문서",
          threadId: created.threadId,
          nodeId: "text-1",
          nodeName: "헤드라인",
          actorName: "개발 팀",
          body: "문구를 더 짧게 줄였어요",
          mentions: []
        }
      ]
    });

    const activity = await storage.listCommentActivity({ viewerId: "사용자", limit: 10 });
    expect(activity.events.map((event) => event.type)).toEqual(["resolved", "replied", "created"]);
    expect(activity.events[2]).toMatchObject({
      actorName: "디자인 팀",
      body: "@민지 첫 검수 요청",
      mentions: ["민지"]
    });

    const sidecar = JSON.parse(await readFile(path.join(tempRoot, "comments", "sample-file.json"), "utf8"));
    expect(sidecar.activity.map((event: { type: string }) => event.type)).toEqual([
      "resolved",
      "replied",
      "created"
    ]);
  });

  test("comment threads reject a missing body with a validation error", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    await expect(
      storage.createCommentThread("sample-file", {
        nodeId: "text-1",
        body: undefined as unknown as string
      })
    ).rejects.toThrow("comment body is required");
  });

  test("comment replies reject a missing body with a validation error", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "문구 확인 필요"
    });

    await expect(
      storage.addCommentReply("sample-file", created.threadId, {
        body: undefined as unknown as string
      })
    ).rejects.toThrow("comment body is required");
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

  test("persists node export presets through agent commands", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "set_export_presets",
          nodeId: "text-1",
          presets: [
            { id: "preset-png-3x", format: "png", scale: 3, suffix: "@hero" },
            { id: "preset-svg", format: "svg", scale: 1, suffix: "" }
          ]
        }
      ] as any
    });
    const previewText = result.preview.pages[0].children[0].children[0] as any;
    const persisted = await storage.readFile("sample-file");
    const persistedText = persisted.pages[0].children[0].children[0] as any;

    expect(result).toMatchObject({
      persisted: true,
      validation: { ok: true, issueCount: 0 },
      audit: {
        commandTypes: ["set_export_presets"],
        changedNodeIds: ["text-1"]
      }
    });
    expect(previewText.export_presets).toEqual([
      { id: "preset-png-3x", format: "png", scale: 3, suffix: "@hero" },
      { id: "preset-svg", format: "svg", scale: 1, suffix: "" }
    ]);
    expect(persistedText.export_presets).toEqual(previewText.export_presets);
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

  test("persists agent-applied typography token bindings on text nodes", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: {
            id: "typography-heading-lg",
            name: "Typography / Heading LG",
            type: "typography",
            value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 })
          }
        } as any,
        {
          type: "set_text_typography_token",
          nodeId: "text-1",
          tokenId: "typography-heading-lg"
        } as any
      ]
    });

    const persisted = await storage.readFile("sample-file");
    const text = persisted.pages[0].children[0].children[0];

    expect(text.content).toMatchObject({
      type: "text",
      font_family: "Inter",
      font_size: 32,
      typography_token: "typography-heading-lg"
    });
    expect(await storage.validateDocument("sample-file")).toMatchObject({ ok: true, issueCount: 0 });
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

  const verticalBaselineLayout = await storage.applyAgentCommands("sample-file", {
    dryRun: true,
    commands: [
      { type: "update_geometry", nodeId: "frame-1", width: 260, height: 120 },
      { type: "update_geometry", nodeId: "text-1", width: 40, height: 96 },
      { type: "set_text_writing_mode", nodeId: "text-1", writingMode: "vertical_rl" },
      {
        type: "create_text",
        parentId: "frame-1",
        id: "vertical-caption-1",
        name: "세로쓰기 캡션",
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

  const verticalBaselineFrame = verticalBaselineLayout.preview.pages[0].children[0];
  expect(verticalBaselineFrame.children.find((node) => node.id === "text-1")?.content).toMatchObject({
    type: "text",
    writing_mode: "vertical_rl"
  });
  expect(verticalBaselineFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
    x: 20,
    y: 20
  });
  expect(verticalBaselineFrame.children.find((node) => node.id === "vertical-caption-1")?.transform).toMatchObject({
    x: 70,
    y: 27
  });
  expect(verticalBaselineLayout.audit.commandTypes).toContain("set_text_writing_mode");

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

function findImageNode(document: Awaited<ReturnType<FileStorage["readFile"]>>, nodeId: string) {
  const stack = document.pages.flatMap((page) => page.children);
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) {
      continue;
    }
    if (node.id === nodeId && node.content.type === "image") {
      return node;
    }
    stack.push(...node.children);
  }
  return null;
}
