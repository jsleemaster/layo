import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { validateDocument as validateDesignFile } from "./agent-control";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

function storageMutationLockDir(rootDir: string, storagePath: string) {
  const resourceHash = createHash("sha256")
    .update(path.resolve(storagePath))
    .digest("hex");
  return path.join(rootDir, "locks", `storage-mutation-${resourceHash}.lock`);
}

async function waitForPath(targetPath: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await stat(targetPath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for path: ${targetPath}`);
}

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

  test("concurrent project creation reserves an explicit document id exactly once", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const sharedDocumentId = "shared-explicit-file";
    const sharedFilePath = path.join(tempRoot, "files", `${sharedDocumentId}.json`);
    const sharedFileLockDir = storageMutationLockDir(tempRoot, sharedFilePath);
    await mkdir(sharedFileLockDir, { recursive: true });
    await writeFile(
      path.join(sharedFileLockDir, "owner.json"),
      JSON.stringify({
        schemaVersion: 1,
        token: "test-file-lock",
        pid: process.pid,
        hostname: hostname(),
        acquiredAt: new Date().toISOString()
      }),
      "utf8"
    );

    const firstStorage = new FileStorage(tempRoot);
    const secondStorage = new FileStorage(tempRoot);
    const firstCreation = firstStorage.createProject({
      projectId: "concurrent-project-a",
      name: "동시 프로젝트 A",
      documentId: sharedDocumentId,
      documentName: "동시 문서 A"
    });
    const secondCreation = secondStorage.createProject({
      projectId: "concurrent-project-b",
      name: "동시 프로젝트 B",
      documentId: sharedDocumentId,
      documentName: "동시 문서 B"
    });

    try {
      await Promise.all([
        waitForPath(
          storageMutationLockDir(
            tempRoot,
            path.join(tempRoot, "projects", "concurrent-project-a.json")
          )
        ),
        waitForPath(
          storageMutationLockDir(
            tempRoot,
            path.join(tempRoot, "projects", "concurrent-project-b.json")
          )
        )
      ]);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      await rm(sharedFileLockDir, { recursive: true, force: true });
    }

    const results = await Promise.allSettled([firstCreation, secondCreation]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(rejected?.reason).toMatchObject({ code: "EEXIST", statusCode: 409 });

    const verifier = new FileStorage(tempRoot);
    const projects = await verifier.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].documents).toEqual([
      expect.objectContaining({ documentId: sharedDocumentId })
    ]);
    await expect(verifier.readFile(sharedDocumentId)).resolves.toMatchObject({
      id: sharedDocumentId,
      name: projects[0].documents[0].name
    });
  });

  test("document reservation rejects case-folded cross-project collisions", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "case-project-a",
      name: "대소문자 프로젝트 A",
      documentId: "Shared-File",
      documentName: "대소문자 문서 A"
    });

    await expect(
      storage.createProject({
        projectId: "case-project-b",
        name: "대소문자 프로젝트 B",
        documentId: "shared-file",
        documentName: "대소문자 문서 B"
      })
    ).rejects.toMatchObject({ code: "EEXIST", statusCode: 409 });

    expect((await storage.listProjects()).map((project) => project.projectId)).toEqual([
      "case-project-a"
    ]);
    expect((await storage.listFiles()).map((file) => file.id)).toEqual([
      "Shared-File"
    ]);
  });

  test("project duplication reserves every destination document before writing", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.createProjectDocument("test-project", {
      documentId: "second-file",
      name: "두 번째 문서"
    });
    await storage.createProject({
      projectId: "collision-owner",
      name: "충돌 소유 프로젝트",
      documentId: "copy-second-file",
      documentName: "보존할 충돌 문서"
    });

    await expect(
      storage.duplicateProject("test-project", {
        projectId: "copy-project",
        documentIdPrefix: "copy"
      })
    ).rejects.toMatchObject({ code: "EEXIST", statusCode: 409 });

    await expect(storage.readProject("copy-project")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(storage.readFile("copy-sample-file")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(storage.readFile("copy-second-file")).resolves.toMatchObject({
      id: "copy-second-file",
      name: "보존할 충돌 문서"
    });
  });

  test("concurrent deletion cannot remove both remaining projects", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const creator = new FileStorage(tempRoot);
    await creator.createProject({
      projectId: "delete-project-a",
      name: "삭제 프로젝트 A",
      documentId: "delete-file-a",
      documentName: "삭제 문서 A"
    });
    await creator.createProject({
      projectId: "delete-project-b",
      name: "삭제 프로젝트 B",
      documentId: "delete-file-b",
      documentName: "삭제 문서 B"
    });

    const firstStorage = new FileStorage(tempRoot);
    const secondStorage = new FileStorage(tempRoot);
    const firstListProjects = firstStorage.listProjects.bind(firstStorage);
    const secondListProjects = secondStorage.listProjects.bind(secondStorage);
    let listArrivals = 0;
    let releaseLists!: () => void;
    const bothListsArrived = new Promise<void>((resolve) => {
      releaseLists = resolve;
    });
    const holdList = (listProjects: () => ReturnType<FileStorage["listProjects"]>) =>
      async () => {
        const projects = await listProjects();
        listArrivals += 1;
        if (listArrivals === 2) {
          releaseLists();
        }
        await Promise.race([
          bothListsArrived,
          new Promise<void>((resolve) => setTimeout(resolve, 500))
        ]);
        return projects;
      };
    firstStorage.listProjects = holdList(firstListProjects);
    secondStorage.listProjects = holdList(secondListProjects);

    const results = await Promise.allSettled([
      firstStorage.deleteProject("delete-project-a"),
      secondStorage.deleteProject("delete-project-b")
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const verifier = new FileStorage(tempRoot);
    const projects = await verifier.listProjects();
    expect(projects).toHaveLength(1);
    await expect(
      verifier.readFile(projects[0].currentDocumentId)
    ).resolves.toMatchObject({ id: projects[0].currentDocumentId });
  });

  test("cannot replace an existing shared project through project creation", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "existing-project",
      name: "기존 프로젝트",
      documentId: "existing-file",
      documentName: "기존 문서"
    });
    await storage.setProjectSharing("existing-project", {
      mode: "team",
      teamId: "team-alpha"
    });

    await expect(
      storage.createProject({
        projectId: "existing-project",
        name: "덮어쓴 프로젝트",
        documentId: "replacement-file",
        documentName: "덮어쓴 문서"
      })
    ).rejects.toMatchObject({ code: "EEXIST", statusCode: 409 });

    await expect(storage.readProject("existing-project")).resolves.toMatchObject({
      name: "기존 프로젝트",
      sharing: { mode: "team", teamId: "team-alpha" },
      documents: [expect.objectContaining({ documentId: "existing-file" })]
    });
    await expect(storage.readFile("replacement-file")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  test("serializes project sharing compare-and-set across storage instances", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const firstStorage = new FileStorage(tempRoot);
    await firstStorage.createProject({
      projectId: "shared-project",
      name: "공유 프로젝트",
      documentId: "shared-file",
      documentName: "공유 문서"
    });
    await firstStorage.setProjectSharing("shared-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const secondStorage = new FileStorage(tempRoot);
    const expectedSharing = { mode: "team", teamId: "team-alpha" } as const;

    const results = await Promise.allSettled([
      firstStorage.setProjectSharing(
        "shared-project",
        { mode: "team", teamId: "team-beta" },
        { expectedSharing }
      ),
      secondStorage.setProjectSharing(
        "shared-project",
        { mode: "team", teamId: "team-gamma" },
        { expectedSharing }
      )
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(rejected?.reason).toMatchObject({ code: "ECONFLICT", statusCode: 409 });
    expect((await firstStorage.readProject("shared-project")).sharing).toEqual(
      expect.objectContaining({
        mode: "team",
        teamId: expect.stringMatching(/^team-(beta|gamma)$/)
      })
    );
  });

  test("project mutations reject a sharing boundary that changed after authorization", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "guarded-project",
      name: "보호 프로젝트",
      documentId: "guarded-file",
      documentName: "보호 문서"
    });
    await storage.createProject({
      projectId: "retained-project",
      name: "유지 프로젝트",
      documentId: "retained-file",
      documentName: "유지 문서"
    });
    await storage.setProjectSharing("guarded-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const expectedSharing = { mode: "team", teamId: "team-alpha" } as const;
    await storage.setProjectSharing("guarded-project", {
      mode: "team",
      teamId: "team-beta"
    });

    await expect(
      storage.updateProject(
        "guarded-project",
        { name: "오래된 권한 변경" },
        { expectedSharing }
      )
    ).rejects.toMatchObject({ code: "ECONFLICT", statusCode: 409 });
    await expect(
      storage.createProjectDocument(
        "guarded-project",
        { documentId: "stale-file", name: "오래된 권한 문서" },
        { expectedSharing }
      )
    ).rejects.toMatchObject({ code: "ECONFLICT", statusCode: 409 });
    await expect(
      storage.duplicateProject(
        "guarded-project",
        { projectId: "stale-copy", documentIdPrefix: "stale-copy" },
        { expectedSharing }
      )
    ).rejects.toMatchObject({ code: "ECONFLICT", statusCode: 409 });
    await expect(
      storage.deleteProject("guarded-project", { expectedSharing })
    ).rejects.toMatchObject({ code: "ECONFLICT", statusCode: 409 });

    await expect(storage.readProject("guarded-project")).resolves.toMatchObject({
      name: "보호 프로젝트",
      sharing: { mode: "team", teamId: "team-beta" }
    });
    await expect(storage.readFile("stale-file")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(storage.readProject("stale-copy")).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("project document creation cannot restore stale private sharing after an owner shares it", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const ownerStorage = new FileStorage(tempRoot);
    await ownerStorage.createProject({
      projectId: "sharing-race-project",
      name: "공유 경계 경쟁 프로젝트",
      documentId: "sharing-race-file",
      documentName: "기존 문서"
    });
    const staleWriter = new FileStorage(tempRoot);
    const internalStaleWriter = staleWriter as unknown as {
      writeFileWithoutMutationLock: FileStorage["writeFile"];
    };
    const originalWriteFile =
      internalStaleWriter.writeFileWithoutMutationLock.bind(staleWriter);
    let signalWriteStarted!: () => void;
    let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      signalWriteStarted = resolve;
    });
    const writeRelease = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    internalStaleWriter.writeFileWithoutMutationLock = async (fileId, document) => {
      signalWriteStarted();
      await writeRelease;
      return originalWriteFile(fileId, document);
    };

    const documentCreation = staleWriter.createProjectDocument("sharing-race-project", {
      documentId: "sharing-race-new-file",
      name: "새 문서"
    });
    await writeStarted;
    const sharing = ownerStorage.setProjectSharing("sharing-race-project", {
      mode: "team",
      teamId: "team-alpha"
    });
    const sharingFinishedBeforeRelease = await Promise.race([
      sharing.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 100))
    ]);
    releaseWrite();
    await Promise.all([documentCreation, sharing]);

    expect(sharingFinishedBeforeRelease).toBe(false);
    await expect(ownerStorage.readProject("sharing-race-project")).resolves.toMatchObject({
      sharing: { mode: "team", teamId: "team-alpha" },
      documents: expect.arrayContaining([
        expect.objectContaining({ documentId: "sharing-race-new-file" })
      ])
    });
  });

  test("merges independent stale document snapshots without losing either browser edit", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const base = await storage.readFile("sample-file");
    const remoteSnapshot = structuredClone(base);
    const remoteText = findNode(remoteSnapshot, "text-1");
    if (!remoteText || remoteText.content.type !== "text") {
      throw new Error("missing remote text node");
    }
    remoteText.content.value = "Remote edit";
    const localSnapshot = structuredClone(base);
    const localText = findNode(localSnapshot, "text-1");
    if (!localText) {
      throw new Error("missing local text node");
    }
    localText.transform.x = 240;

    await storage.replaceFileSnapshot("sample-file", remoteSnapshot);
    await Reflect.apply(storage.replaceFileSnapshot, storage, [
      "sample-file",
      localSnapshot,
      base
    ]);

    const merged = await storage.readFile("sample-file");
    expect(findNode(merged, "text-1")).toMatchObject({
      transform: { x: 240 },
      content: { type: "text", value: "Remote edit" }
    });
  });

  test("rejects divergent concurrent reorders instead of silently dropping one", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const seeded = await storage.readFile("sample-file");
    seeded.tokens = [
      { id: "token-a", name: "A", type: "color", value: "#111111" },
      { id: "token-b", name: "B", type: "color", value: "#222222" },
      { id: "token-c", name: "C", type: "color", value: "#333333" }
    ];
    await storage.writeFile("sample-file", seeded);
    const base = await storage.readFile("sample-file");
    const remoteSnapshot = structuredClone(base);
    remoteSnapshot.tokens = [base.tokens![1]!, base.tokens![0]!, base.tokens![2]!];
    const localSnapshot = structuredClone(base);
    localSnapshot.tokens = [base.tokens![0]!, base.tokens![2]!, base.tokens![1]!];

    await storage.replaceFileSnapshot("sample-file", remoteSnapshot);

    await expect(
      storage.replaceFileSnapshot("sample-file", localSnapshot, base)
    ).rejects.toThrow("document snapshot conflict at document.tokens");
    expect((await storage.readFile("sample-file")).tokens?.map((token) => token.id)).toEqual([
      "token-b",
      "token-a",
      "token-c"
    ]);
  });

  test("rejects a concurrent insertion whose placement conflicts with a stale reorder", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const seeded = await storage.readFile("sample-file");
    seeded.tokens = [
      { id: "token-a", name: "A", type: "color", value: "#111111" },
      { id: "token-b", name: "B", type: "color", value: "#222222" },
      { id: "token-c", name: "C", type: "color", value: "#333333" }
    ];
    await storage.writeFile("sample-file", seeded);
    const base = await storage.readFile("sample-file");
    const remoteSnapshot = structuredClone(base);
    remoteSnapshot.tokens = [
      base.tokens![0]!,
      { id: "token-x", name: "X", type: "color", value: "#444444" },
      base.tokens![1]!,
      base.tokens![2]!
    ];
    const localSnapshot = structuredClone(base);
    localSnapshot.tokens = [base.tokens![1]!, base.tokens![0]!, base.tokens![2]!];

    await storage.replaceFileSnapshot("sample-file", remoteSnapshot);

    await expect(
      storage.replaceFileSnapshot("sample-file", localSnapshot, base)
    ).rejects.toThrow("document snapshot conflict at document.tokens");
    expect((await storage.readFile("sample-file")).tokens?.map((token) => token.id)).toEqual([
      "token-a",
      "token-x",
      "token-b",
      "token-c"
    ]);
  });

  test("keeps assets referenced only by a component variant source node", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const asset = await storage.createAsset({
      name: "variant.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    });
    const document = await storage.readFile("sample-file");
    const sourceNode = findNode(document, "text-1");
    if (!sourceNode) {
      throw new Error("missing component source node");
    }
    document.components = [
      {
        id: "component-variant-image",
        name: "Variant image",
        source_node: structuredClone(sourceNode),
        variants: [
          {
            id: "variant-image",
            name: "Image",
            properties: [],
            source_node: imageNodeForAsset(asset.assetId, "variant-image-source")
          }
        ]
      }
    ];
    await storage.writeFile("sample-file", document);

    await expect(storage.deleteAssetIfUnreferenced(asset.assetId)).resolves.toEqual({
      assetId: asset.assetId,
      deleted: false,
      reason: "referenced"
    });
    await expect(storage.readAsset(asset.assetId)).resolves.toMatchObject({ assetId: asset.assetId });
  });

  test("serializes asset cleanup with an in-flight document reference mutation", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const asset = await storage.createAsset({
      name: "concurrent.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    });
    let releaseMutation!: () => void;
    const mutationRelease = new Promise<void>((resolve) => {
      releaseMutation = resolve;
    });
    let markMutationStarted!: () => void;
    const mutationStarted = new Promise<void>((resolve) => {
      markMutationStarted = resolve;
    });
    const internalStorage = storage as unknown as {
      mutateFile<T>(
        fileId: string,
        mutation: (document: Awaited<ReturnType<FileStorage["readFile"]>>) => Promise<T>
      ): Promise<T>;
    };
    const mutation = internalStorage.mutateFile("sample-file", async (document) => {
      markMutationStarted();
      await mutationRelease;
      document.pages[0]?.children.push(imageNodeForAsset(asset.assetId, "concurrent-image"));
    });
    await mutationStarted;

    const cleanup = storage.deleteAssetIfUnreferenced(asset.assetId);
    const earlyResult = await Promise.race([
      cleanup.then(() => "completed" as const),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 75))
    ]);
    releaseMutation();
    await mutation;
    const cleanupResult = await cleanup;

    expect(earlyResult).toBe("blocked");
    expect(cleanupResult).toEqual({
      assetId: asset.assetId,
      deleted: false,
      reason: "referenced"
    });
    await expect(storage.readAsset(asset.assetId)).resolves.toMatchObject({ assetId: asset.assetId });
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

    await expect(
      target.importProjectArchive(exported.archive, {
        projectId: "imported-project",
        name: "덮어쓴 복원 프로젝트",
        documentIdPrefix: "replacement"
      })
    ).rejects.toMatchObject({ code: "EEXIST", statusCode: 409 });
    await expect(target.readProject("imported-project")).resolves.toMatchObject({
      name: "복원 프로젝트",
      sharing: { mode: "private" }
    });
  });

  test("project archive import preserves a conflicting global asset and leaves no partial project", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const source = await storageWithDocument(path.join(tempRoot, "source"));
    const pixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const asset = await source.createAsset({
      name: "archive.png",
      mimeType: "image/png",
      dataBase64: pixelPng
    });
    await source.createNode("sample-file", "page-1", {
      id: "archive-conflict-image",
      kind: "image",
      name: "충돌 이미지",
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
    const exported = await source.exportProjectArchive("test-project");

    const target = new FileStorage(path.join(tempRoot, "target"));
    const conflictingData = Buffer.from(pixelPng, "base64");
    const lastByteIndex = conflictingData.length - 1;
    conflictingData[lastByteIndex] = conflictingData[lastByteIndex]! ^ 0xff;
    const internals = target as unknown as {
      writeAsset(
        metadata: {
          assetId: string;
          name: string;
          mimeType: string;
          byteLength: number;
          url: string;
        },
        data: Buffer
      ): Promise<unknown>;
    };
    await internals.writeAsset(
      {
        assetId: asset.assetId,
        name: "보존할 기존 이미지",
        mimeType: "image/png",
        byteLength: conflictingData.length,
        url: `/assets/${asset.assetId}`
      },
      conflictingData
    );

    await expect(
      target.importProjectArchive(exported.archive, {
        projectId: "asset-conflict-project",
        documentIdPrefix: "asset-conflict"
      })
    ).rejects.toMatchObject({ code: "EEXIST", statusCode: 409 });

    await expect(target.readProject("asset-conflict-project")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(target.readFile("asset-conflict-sample-file")).rejects.toMatchObject({
      code: "ENOENT"
    });
    const retainedAsset = await target.readAsset(asset.assetId);
    expect(retainedAsset.name).toBe("보존할 기존 이미지");
    expect(retainedAsset.data.equals(conflictingData)).toBe(true);
  });

  test("project archive import reuses a byte-identical global asset across new projects", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const source = await storageWithDocument(path.join(tempRoot, "source"));
    const pixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const asset = await source.createAsset({
      name: "shared.png",
      mimeType: "image/png",
      dataBase64: pixelPng
    });
    await source.createNode("sample-file", "page-1", {
      id: "shared-archive-image",
      kind: "image",
      name: "공유 이미지",
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
    const exported = await source.exportProjectArchive("test-project");
    const target = new FileStorage(path.join(tempRoot, "target"));

    await target.importProjectArchive(exported.archive, {
      projectId: "asset-reuse-project-a",
      documentIdPrefix: "asset-reuse-a"
    });
    await expect(
      target.importProjectArchive(exported.archive, {
        projectId: "asset-reuse-project-b",
        documentIdPrefix: "asset-reuse-b"
      })
    ).resolves.toMatchObject({
      project: { projectId: "asset-reuse-project-b" },
      assetCount: 1
    });

    expect(
      (await target.readAsset(asset.assetId)).data.equals(
        Buffer.from(pixelPng, "base64")
      )
    ).toBe(true);
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

  test("library registry publication retries with the same idempotency key only publish once", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const options = {
      libraryId: "team-kit",
      name: "Team Kit",
      idempotencyKey: "publish-team-kit-v1"
    } as any;

    const first = await storage.publishLibraryToRegistry("sample-file", options);
    const retryingStorage = new FileStorage(tempRoot);
    const retried = await retryingStorage.publishLibraryToRegistry("sample-file", options);

    expect(retried).toEqual(first);
    await expect(
      retryingStorage.publishLibraryToRegistry("sample-file", {
        ...options,
        name: "Another Kit"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/idempotency key was already used/i)
    });
    await expect(retryingStorage.listLibraryRegistryEvents()).resolves.toEqual([
      expect.objectContaining({
        sequence: 1,
        libraryId: "team-kit",
        registryUpdatedAt: first.updatedAt
      })
    ]);
  });

  test("library registry publishes lists reviews and imports the latest shared library", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
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
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ] as any
    });

    const published = await storage.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });
    expect(published).toMatchObject({
      libraryId: "team-kit",
      name: "Team Kit",
      sourceFileId: "sample-file",
      sourceName: "테스트 문서",
      componentCount: 1,
      tokenCount: 1,
      assetCount: 0
    });
    expect(published.publishedAt).toEqual(expect.any(String));

    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-badge",
          name: "Library Badge",
          width: 80,
          height: 32,
          fill: "#2563eb"
        },
        { type: "create_component", nodeId: "library-badge", componentId: "component-badge", name: "Badge" }
      ] as any
    });
    const republished = await storage.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });
    expect(republished.componentCount).toBe(2);
    expect(await storage.listLibraryRegistry()).toEqual([expect.objectContaining({ libraryId: "team-kit" })]);

    const target = await storage.createProject({
      projectId: "target-project",
      name: "대상 프로젝트",
      documentId: "target-file",
      documentName: "대상 문서"
    });
    const targetFileId = target.currentDocumentId;
    const review = await storage.reviewLibraryRegistryItem(targetFileId, "team-kit");
    expect(review).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      originalFileId: "sample-file",
      componentCount: 2,
      tokenCount: 1,
      components: [
        expect.objectContaining({ originalComponentId: "component-card", name: "Card" }),
        expect.objectContaining({ originalComponentId: "component-badge", name: "Badge" })
      ]
    });

    const imported = await storage.importLibraryRegistryItem(targetFileId, "team-kit", { idPrefix: "team" });
    expect(imported).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      componentCount: 2,
      tokenCount: 1,
      componentIdMap: {
        "component-card": "team-component-card",
        "component-badge": "team-component-badge"
      },
      tokenIdMap: {
        "color-brand-primary": "color-brand-primary"
      }
    });
    const targetDocument = await storage.readFile(targetFileId);
    expect(targetDocument.components?.map((component) => component.name)).toEqual(["Card", "Badge"]);
    expect(targetDocument.tokens?.map((token) => token.name)).toEqual(["Brand / Primary"]);
  });

  test("library registry scopes team-published libraries to files shared with the same team", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.createProject({
      projectId: "source-project",
      name: "Source Project",
      documentId: "source-file",
      documentName: "Source File"
    });
    await storage.setProjectSharing("source-project", { mode: "team", teamId: "team-alpha" });
    await storage.applyAgentCommands("source-file", {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
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
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ] as any
    });

    const published = await storage.publishLibraryToRegistry("source-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });
    expect(published).toMatchObject({
      libraryId: "team-kit",
      teamId: "team-alpha"
    });

    await storage.createProject({
      projectId: "target-project",
      name: "Target Project",
      documentId: "target-file",
      documentName: "Target File"
    });
    await storage.setProjectSharing("target-project", { mode: "team", teamId: "team-alpha" });
    await storage.createProject({
      projectId: "other-project",
      name: "Other Project",
      documentId: "other-file",
      documentName: "Other File"
    });
    await storage.setProjectSharing("other-project", { mode: "team", teamId: "team-beta" });
    await storage.createProject({
      projectId: "private-project",
      name: "Private Project",
      documentId: "private-file",
      documentName: "Private File"
    });

    expect(await storage.listLibraryRegistry()).toEqual([
      expect.objectContaining({ libraryId: "team-kit", teamId: "team-alpha" })
    ]);
    expect(await storage.listLibraryRegistry("target-file")).toEqual([
      expect.objectContaining({ libraryId: "team-kit", teamId: "team-alpha" })
    ]);
    expect(await storage.listLibraryRegistry("other-file")).toEqual([]);
    expect(await storage.listLibraryRegistry("private-file")).toEqual([]);

    await expect(storage.reviewLibraryRegistryItem("target-file", "team-kit")).resolves.toMatchObject({
      libraryId: "team-kit",
      componentCount: 1
    });
    await expect(storage.importLibraryRegistryItem("target-file", "team-kit", { idPrefix: "team" })).resolves.toMatchObject({
      libraryId: "team-kit",
      componentIdMap: { "component-card": "team-component-card" }
    });
    await expect(storage.reviewLibraryRegistryItem("other-file", "team-kit")).rejects.toThrow(/not authorized/i);
    await expect(storage.importLibraryRegistryItem("private-file", "team-kit")).rejects.toThrow(/not authorized/i);
  });

  test("library registry reviews and imports published token sets and themes as a replacement bundle", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.importTokensDtcg("sample-file", {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeTokenSets: ["base", "light"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      },
      light: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#1d4ed8"
          }
        }
      },
      dark: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#93c5fd"
          }
        }
      }
    });
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-brand",
            name: "Brand Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["base", "light", "dark"]
          }
        }
      ] as any
    });
    await storage.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });

    const target = await storage.createProject({
      projectId: "target-project",
      name: "대상 프로젝트",
      documentId: "target-file",
      documentName: "대상 문서"
    });
    const targetFileId = target.currentDocumentId;
    await storage.importTokensDtcg(targetFileId, {
      $metadata: {
        tokenSetOrder: ["legacy"],
        activeTokenSets: ["legacy"]
      },
      legacy: {
        Legacy: {
          Primary: {
            $type: "color",
            $value: "#111827"
          }
        }
      }
    });
    await storage.applyAgentCommands(targetFileId, {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-legacy",
            name: "Legacy Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["legacy"]
          }
        }
      ] as any
    });

    const review = await storage.reviewLibraryRegistryTokens(targetFileId, "team-kit");
    expect(review).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      originalFileId: "sample-file",
      originalName: "테스트 문서",
      tokenCount: 3,
      tokenSetCount: 3,
      tokenThemeCount: 1,
      replacesTokenCount: 1,
      replacesTokenSetCount: 1,
      replacesTokenThemeCount: 1,
      tokenSets: [
        { id: "base", name: "base", enabled: true },
        { id: "light", name: "light", enabled: true },
        { id: "dark", name: "dark", enabled: false }
      ],
      tokenThemes: [
        {
          id: "theme-brand",
          name: "Brand Theme",
          group: "mode",
          enabled: true,
          token_set_ids: ["base", "light", "dark"]
        }
      ]
    });

    const imported = await storage.importLibraryRegistryTokens(targetFileId, "team-kit");
    expect(imported).toMatchObject({
      fileId: targetFileId,
      libraryId: "team-kit",
      libraryName: "Team Kit",
      tokenCount: 3,
      tokenSetCount: 3,
      tokenThemeCount: 1,
      replacedTokenCount: 1,
      replacedTokenSetCount: 1,
      replacedTokenThemeCount: 1
    });

    const targetDocument = await storage.readFile(targetFileId);
    expect(targetDocument.tokens?.map((token) => [token.id, token.value])).toEqual([
      ["color-base-brand-primary", "#2563eb"],
      ["color-light-brand-primary", "#1d4ed8"],
      ["color-dark-brand-primary", "#93c5fd"]
    ]);
    expect(targetDocument.token_sets).toEqual([
      { id: "base", name: "base", enabled: true },
      { id: "light", name: "light", enabled: true },
      { id: "dark", name: "dark", enabled: false }
    ]);
    expect(targetDocument.token_themes).toEqual([
      {
        id: "theme-brand",
        name: "Brand Theme",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "light", "dark"]
      }
    ]);
    expect(targetDocument.components ?? []).toEqual([]);
  });

  test("library registry token bundle subscriptions report and apply republished token updates", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.importTokensDtcg("sample-file", {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeTokenSets: ["base", "light"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      },
      light: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#1d4ed8"
          }
        }
      },
      dark: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#93c5fd"
          }
        }
      }
    });
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-brand",
            name: "Brand Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["base", "light", "dark"]
          }
        }
      ] as any
    });
    const firstPublish = await storage.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });

    const target = await storage.createProject({
      projectId: "target-project",
      name: "대상 프로젝트",
      documentId: "target-file",
      documentName: "대상 문서"
    });
    const targetFileId = target.currentDocumentId;
    await storage.importTokensDtcg(targetFileId, {
      $metadata: {
        tokenSetOrder: ["legacy"],
        activeTokenSets: ["legacy"]
      },
      legacy: {
        Legacy: {
          Primary: {
            $type: "color",
            $value: "#111827"
          }
        }
      }
    });
    await storage.applyAgentCommands(targetFileId, {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-legacy",
            name: "Legacy Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["legacy"]
          }
        }
      ] as any
    });

    await storage.importLibraryRegistryTokens(targetFileId, "team-kit");

    expect(await storage.listLibraryRegistryTokenUpdates(targetFileId)).toEqual([]);
    expect(await storage.listLibraryRegistryTokenSubscriptions(targetFileId)).toEqual([
      expect.objectContaining({
        fileId: targetFileId,
        libraryId: "team-kit",
        libraryName: "Team Kit",
        tokenCount: 3,
        tokenSetCount: 3,
        tokenThemeCount: 1,
        importedRegistryUpdatedAt: firstPublish.updatedAt
      })
    ]);

    await storage.importTokensDtcg("sample-file", {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark", "contrast"],
        activeTokenSets: ["base", "dark"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#0ea5e9"
          }
        }
      },
      light: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#38bdf8"
          }
        }
      },
      dark: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#bae6fd"
          }
        }
      },
      contrast: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#082f49"
          }
        }
      }
    });
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-brand",
            name: "Brand Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["base", "dark"]
          }
        }
      ] as any
    });
    const secondPublish = await storage.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });
    expect(secondPublish.updatedAt > firstPublish.updatedAt).toBe(true);

    expect(await storage.listLibraryRegistryTokenUpdates(targetFileId)).toEqual([
      expect.objectContaining({
        fileId: targetFileId,
        libraryId: "team-kit",
        libraryName: "Team Kit",
        importedRegistryUpdatedAt: firstPublish.updatedAt,
        registryUpdatedAt: secondPublish.updatedAt,
        tokenCount: 4,
        tokenSetCount: 4,
        tokenThemeCount: 1
      })
    ]);

    const updated = await storage.updateLibraryRegistryTokens(targetFileId, "team-kit");
    expect(updated).toMatchObject({
      fileId: targetFileId,
      libraryId: "team-kit",
      libraryName: "Team Kit",
      tokenCount: 4,
      tokenSetCount: 4,
      tokenThemeCount: 1,
      replacedTokenCount: 3,
      replacedTokenSetCount: 3,
      replacedTokenThemeCount: 1
    });
    expect(await storage.listLibraryRegistryTokenUpdates(targetFileId)).toEqual([]);
    const targetDocument = await storage.readFile(targetFileId);
    expect(targetDocument.tokens?.map((token) => [token.id, token.value])).toEqual([
      ["color-base-brand-primary", "#0ea5e9"],
      ["color-light-brand-primary", "#38bdf8"],
      ["color-dark-brand-primary", "#bae6fd"],
      ["color-contrast-brand-primary", "#082f49"]
    ]);
    expect(targetDocument.token_sets).toEqual([
      { id: "base", name: "base", enabled: true },
      { id: "light", name: "light", enabled: false },
      { id: "dark", name: "dark", enabled: true },
      { id: "contrast", name: "contrast", enabled: false }
    ]);
    expect(targetDocument.token_themes).toEqual([
      {
        id: "theme-brand",
        name: "Brand Theme",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "dark"]
      }
    ]);
  });

  test("library registry subscriptions report and apply updates without duplicating components", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
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
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ] as any
    });
    const firstPublish = await storage.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });
    const target = await storage.createProject({
      projectId: "target-project",
      name: "대상 프로젝트",
      documentId: "target-file",
      documentName: "대상 문서"
    });
    const targetFileId = target.currentDocumentId;

    await storage.importLibraryRegistryItem(targetFileId, "team-kit", { idPrefix: "team" });

    expect(await storage.listLibraryRegistryUpdates(targetFileId)).toEqual([]);
    expect(await storage.listLibraryRegistrySubscriptions(targetFileId)).toEqual([
      expect.objectContaining({
        fileId: targetFileId,
        libraryId: "team-kit",
        libraryName: "Team Kit",
        importedRegistryUpdatedAt: firstPublish.updatedAt,
        componentIdMap: { "component-card": "team-component-card" }
      })
    ]);

    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-badge",
          name: "Library Badge",
          width: 80,
          height: 32,
          fill: "#2563eb"
        },
        { type: "create_component", nodeId: "library-badge", componentId: "component-badge", name: "Badge" }
      ] as any
    });
    const secondPublish = await storage.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });
    expect(secondPublish.updatedAt > firstPublish.updatedAt).toBe(true);

    const updates = await storage.listLibraryRegistryUpdates(targetFileId);
    expect(updates).toEqual([
      expect.objectContaining({
        fileId: targetFileId,
        libraryId: "team-kit",
        libraryName: "Team Kit",
        importedRegistryUpdatedAt: firstPublish.updatedAt,
        registryUpdatedAt: secondPublish.updatedAt,
        componentCount: 2,
        tokenCount: 1
      })
    ]);

    const updated = await storage.updateLibraryRegistryItem(targetFileId, "team-kit");
    expect(updated).toMatchObject({
      libraryId: "team-kit",
      libraryName: "Team Kit",
      componentCount: 2,
      tokenCount: 1,
      componentIdMap: {
        "component-card": "team-component-card",
        "component-badge": "team-component-badge"
      },
      tokenIdMap: {
        "color-brand-primary": "color-brand-primary"
      }
    });
    expect(await storage.listLibraryRegistryUpdates(targetFileId)).toEqual([]);
    const targetDocument = await storage.readFile(targetFileId);
    expect(targetDocument.components?.map((component) => component.name)).toEqual(["Card", "Badge"]);
    expect(targetDocument.components?.map((component) => component.id)).toEqual([
      "team-component-card",
      "team-component-badge"
    ]);
  });

  test("library registry events are durable across storage instances and scoped to target file teams", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const publishingStorage = new FileStorage(tempRoot);
    await publishingStorage.createProject({
      projectId: "source-project",
      name: "소스 프로젝트",
      documentId: "source-file",
      documentName: "소스 문서"
    });
    await publishingStorage.setProjectSharing("source-project", { mode: "team", teamId: "team-alpha" });
    await publishingStorage.applyAgentCommands("source-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-card",
          name: "Library Card",
          width: 160,
          height: 96,
          fill: "#ffffff"
        },
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ] as any
    });
    const firstPublish = await publishingStorage.publishLibraryToRegistry("source-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });

    const subscriberStorage = new FileStorage(tempRoot);
    await subscriberStorage.createProject({
      projectId: "target-project",
      name: "대상 프로젝트",
      documentId: "target-file",
      documentName: "대상 문서"
    });
    await subscriberStorage.setProjectSharing("target-project", { mode: "team", teamId: "team-alpha" });
    await subscriberStorage.createProject({
      projectId: "other-project",
      name: "다른 팀 프로젝트",
      documentId: "other-file",
      documentName: "다른 팀 문서"
    });
    await subscriberStorage.setProjectSharing("other-project", { mode: "team", teamId: "team-beta" });

    await expect(subscriberStorage.listLibraryRegistryEvents({ fileId: "target-file" })).resolves.toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        sequence: 1,
        type: "published",
        libraryId: "team-kit",
        libraryName: "Team Kit",
        sourceFileId: "source-file",
        sourceName: "소스 문서",
        teamId: "team-alpha",
        componentCount: 1,
        tokenCount: 0,
        assetCount: 0,
        registryUpdatedAt: firstPublish.updatedAt
      })
    ]);
    await expect(subscriberStorage.listLibraryRegistryEvents({ fileId: "other-file" })).resolves.toEqual([]);

    await publishingStorage.applyAgentCommands("source-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-badge",
          name: "Library Badge",
          width: 80,
          height: 32,
          fill: "#2563eb"
        },
        { type: "create_component", nodeId: "library-badge", componentId: "component-badge", name: "Badge" }
      ] as any
    });
    const secondPublish = await publishingStorage.publishLibraryToRegistry("source-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });

    await expect(subscriberStorage.listLibraryRegistryEvents({ fileId: "target-file", after: 1 })).resolves.toEqual([
      expect.objectContaining({
        sequence: 2,
        libraryId: "team-kit",
        componentCount: 2,
        registryUpdatedAt: secondPublish.updatedAt
      })
    ]);
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

  test("comment live events are durable across storage instances and replay after a sequence", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const writer = await storageWithDocument(tempRoot);
    const created = await writer.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "@사용자 멀티 인스턴스 확인",
      authorName: "디자인 팀",
      mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
    });
    await writer.addCommentReply("sample-file", created.threadId, {
      body: "@사용자 답글 확인",
      authorName: "개발 팀"
    });
    await writer.markCommentThreadRead("sample-file", created.threadId, { viewerId: "사용자" });
    await writer.resolveCommentThread("sample-file", created.threadId);

    const reader = new FileStorage(tempRoot);
    await expect(reader.listCommentLiveEvents({ fileId: "sample-file" })).resolves.toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        sequence: 1,
        type: "created",
        fileId: "sample-file",
        threadId: created.threadId
      }),
      expect.objectContaining({
        sequence: 2,
        type: "replied",
        fileId: "sample-file",
        threadId: created.threadId
      }),
      expect.objectContaining({
        sequence: 3,
        type: "read",
        fileId: "sample-file",
        threadId: created.threadId,
        viewerId: "사용자"
      }),
      expect.objectContaining({
        sequence: 4,
        type: "resolved",
        fileId: "sample-file",
        threadId: created.threadId
      })
    ]);
    await expect(reader.listCommentLiveEvents({ fileId: "sample-file", after: 2 })).resolves.toEqual([
      expect.objectContaining({ sequence: 3, type: "read" }),
      expect.objectContaining({ sequence: 4, type: "resolved" })
    ]);
  });

  test("comment live event pagination returns the oldest retained events before newer events", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "백로그 기준 이벤트",
      authorId: "user-owner",
      authorName: "소유자"
    });
    const sidecarPath = path.join(tempRoot, "comments", "sample-file.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    const firstEvent = sidecar.events[0];
    const firstCreatedAt = Date.parse(firstEvent.createdAt);
    sidecar.events = Array.from({ length: 150 }, (_, index) => ({
      ...firstEvent,
      eventId: `event-${index + 1}`,
      sequence: index + 1,
      createdAt: new Date(firstCreatedAt + index).toISOString()
    }));
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

    const firstBatch = await storage.listCommentLiveEvents({
      fileId: "sample-file",
      after: 0,
      limit: 100
    });
    expect(firstBatch.map((event) => event.sequence)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1)
    );

    const secondBatch = await storage.listCommentLiveEvents({
      fileId: "sample-file",
      after: firstBatch[firstBatch.length - 1].sequence,
      limit: 100
    });
    expect(secondBatch.map((event) => event.sequence)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 101)
    );
    await expect(storage.listCommentLiveEvents({})).rejects.toMatchObject({
      statusCode: 400
    });
  });

  test("comment mutations preserve concurrent writers across FileStorage instances", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const creator = await storageWithDocument(tempRoot);
    const writers = Array.from({ length: 8 }, () => new FileStorage(tempRoot));

    await Promise.all(
      writers.map((writer, index) =>
        writer.createCommentThread("sample-file", {
          nodeId: "text-1",
          body: `동시 코멘트 ${index + 1}`,
          authorId: `user-${index + 1}`,
          authorName: `사용자 ${index + 1}`
        })
      )
    );

    const threads = await creator.listCommentThreads("sample-file");
    expect(threads).toHaveLength(8);
    expect(new Set(threads.map((thread) => thread.body))).toEqual(
      new Set(Array.from({ length: 8 }, (_, index) => `동시 코멘트 ${index + 1}`))
    );
    await expect(creator.listCommentLiveEvents({ fileId: "sample-file" })).resolves.toHaveLength(8);
  });

  test("comment authors can edit a thread with optimistic concurrency while other users cannot", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "@민지 처음 검수",
      authorId: "user-minji",
      authorName: "민지",
      mentionTargets: [{ userId: "user-minji", displayName: "민지", role: "editor" }]
    });
    await storage.markCommentThreadRead("sample-file", created.threadId, { viewerId: "user-reviewer" });

    expect(created).toMatchObject({
      authorId: "user-minji",
      modifiedAt: created.createdAt,
      readBy: ["user-minji"]
    });

    await expect(
      storage.updateCommentThread("sample-file", created.threadId, {
        body: "권한 없는 수정",
        actorId: "user-reviewer",
        expectedModifiedAt: created.modifiedAt
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(storage.listCommentThreads("sample-file")).resolves.toEqual([
      expect.objectContaining({ body: "@민지 처음 검수" })
    ]);

    const updated = await storage.updateCommentThread("sample-file", created.threadId, {
      body: "@준호 수정된 검수",
      actorId: "user-minji",
      expectedModifiedAt: created.modifiedAt,
      mentionTargets: [{ userId: "user-junho", displayName: "준호", role: "viewer" }]
    });
    expect(updated).toMatchObject({
      body: "@준호 수정된 검수",
      authorId: "user-minji",
      mentions: ["준호"],
      mentionTargets: [{ userId: "user-junho", displayName: "준호", role: "viewer" }],
      readBy: ["user-minji"]
    });
    expect(updated.modifiedAt).not.toBe(created.modifiedAt);

    await expect(
      storage.updateCommentThread("sample-file", created.threadId, {
        body: "오래된 화면의 수정",
        actorId: "user-minji",
        expectedModifiedAt: created.modifiedAt
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(storage.listCommentThreads("sample-file")).resolves.toEqual([
      expect.objectContaining({ body: "@준호 수정된 검수", modifiedAt: updated.modifiedAt })
    ]);
    await expect(storage.listCommentLiveEvents({ fileId: "sample-file" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "edited", threadId: created.threadId })
      ])
    );
    await expect(storage.listCommentActivity({ viewerId: "user-reviewer" })).resolves.toMatchObject({
      events: [
        {
          type: "edited",
          threadId: created.threadId,
          actorName: "민지",
          body: "@준호 수정된 검수"
        },
        {
          type: "created",
          threadId: created.threadId,
          body: "@준호 수정된 검수"
        }
      ]
    });
  });

  test("comment versions advance past a sidecar timestamp written by another process", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "프로세스 경계 버전",
      authorId: "user-owner",
      authorName: "소유자"
    });
    const sidecarPath = path.join(tempRoot, "comments", "sample-file.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    const externalModifiedAt = new Date(Date.now() + 60_000).toISOString();
    sidecar.threads[0].modifiedAt = externalModifiedAt;
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

    const updated = await storage.updateCommentThread("sample-file", created.threadId, {
      body: "프로세스 경계 이후 수정",
      actorId: "user-owner",
      expectedModifiedAt: externalModifiedAt
    });

    expect(updated.modifiedAt > externalModifiedAt).toBe(true);
  });

  test("comment mutations advance past the latest persisted sidecar event", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "저장소 전체 시간순서",
      authorId: "user-owner",
      authorName: "소유자"
    });
    const sidecarPath = path.join(tempRoot, "comments", "sample-file.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    const externalCreatedAt = new Date(Date.now() + 86_400_000).toISOString();
    sidecar.activity[0].createdAt = externalCreatedAt;
    sidecar.events[0].createdAt = externalCreatedAt;
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

    const updated = await storage.updateCommentThread("sample-file", created.threadId, {
      body: "외부 이벤트 이후 수정",
      actorId: "user-owner",
      expectedModifiedAt: created.modifiedAt
    });
    const persisted = JSON.parse(await readFile(sidecarPath, "utf8"));

    expect(updated.modifiedAt > externalCreatedAt).toBe(true);
    expect(persisted.activity[0].createdAt > externalCreatedAt).toBe(true);
    expect(persisted.events[persisted.events.length - 1].createdAt > externalCreatedAt).toBe(true);
  });

  test("new comments advance past the latest persisted sidecar event", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "기존 코멘트",
      authorId: "user-owner",
      authorName: "소유자"
    });
    const sidecarPath = path.join(tempRoot, "comments", "sample-file.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    const externalCreatedAt = new Date(Date.now() + 172_800_000).toISOString();
    sidecar.activity[0].createdAt = externalCreatedAt;
    sidecar.events[0].createdAt = externalCreatedAt;
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");

    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "외부 이벤트 이후 새 코멘트",
      authorId: "user-owner",
      authorName: "소유자"
    });

    expect(created.createdAt > externalCreatedAt).toBe(true);
  });

  test("resolving an already resolved comment does not duplicate audit events", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "한 번만 해결",
      authorId: "user-owner",
      authorName: "소유자"
    });
    const first = await storage.resolveCommentThread("sample-file", created.threadId, "검수자");
    const sidecarPath = path.join(tempRoot, "comments", "sample-file.json");
    const afterFirstResolve = JSON.parse(await readFile(sidecarPath, "utf8"));

    const second = await storage.resolveCommentThread("sample-file", created.threadId, "검수자");
    const afterSecondResolve = JSON.parse(await readFile(sidecarPath, "utf8"));

    expect(second).toEqual(first);
    expect(afterSecondResolve.activity).toEqual(afterFirstResolve.activity);
    expect(afterSecondResolve.events).toEqual(afterFirstResolve.events);
  });

  test("comment reply owners can edit and delete replies without leaking deleted content", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "검수 요청",
      authorId: "user-owner",
      authorName: "소유자"
    });
    const replied = await storage.addCommentReply("sample-file", created.threadId, {
      body: "삭제될 원문",
      authorId: "user-replier",
      authorName: "답글 작성자"
    });
    const reply = replied.replies[0];

    expect(replied.modifiedAt).not.toBe(created.modifiedAt);
    await expect(
      storage.deleteCommentThread("sample-file", created.threadId, {
        actorId: "user-owner",
        expectedModifiedAt: created.modifiedAt
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(reply).toMatchObject({
      authorId: "user-replier",
      modifiedAt: reply.createdAt
    });
    await expect(
      storage.updateCommentReply("sample-file", created.threadId, reply.replyId, {
        body: "권한 없는 답글 수정",
        actorId: "user-owner",
        expectedModifiedAt: reply.modifiedAt
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    const edited = await storage.updateCommentReply("sample-file", created.threadId, reply.replyId, {
      body: "@민지 수정된 답글",
      actorId: "user-replier",
      expectedModifiedAt: reply.modifiedAt,
      mentionTargets: [{ userId: "user-minji", displayName: "민지", role: "editor" }]
    });
    expect(edited.replies[0]).toMatchObject({
      body: "@민지 수정된 답글",
      mentions: ["민지"],
      authorId: "user-replier"
    });
    expect(edited.modifiedAt).not.toBe(replied.modifiedAt);

    await expect(
      storage.deleteCommentReply("sample-file", created.threadId, reply.replyId, {
        actorId: "user-owner",
        expectedModifiedAt: edited.replies[0].modifiedAt
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    const deleted = await storage.deleteCommentReply("sample-file", created.threadId, reply.replyId, {
      actorId: "user-replier",
      expectedModifiedAt: edited.replies[0].modifiedAt
    });
    expect(deleted.replies).toEqual([]);
    expect(deleted.modifiedAt).not.toBe(edited.modifiedAt);

    const sidecar = JSON.parse(await readFile(path.join(tempRoot, "comments", "sample-file.json"), "utf8"));
    expect(JSON.stringify(sidecar.activity)).not.toContain("삭제될 원문");
    expect(JSON.stringify(sidecar.activity)).not.toContain("수정된 답글");
    expect(sidecar.activity[0]).toMatchObject({
      type: "deleted",
      threadId: created.threadId,
      replyId: reply.replyId,
      actorName: "답글 작성자",
      body: "답글이 삭제되었습니다",
      mentions: [],
      mentionTargets: []
    });
    expect(sidecar.events.at(-1)).toMatchObject({
      type: "deleted",
      threadId: created.threadId,
      replyId: reply.replyId
    });
  });

  test("only a thread owner can delete the thread at its current version", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const created = await storage.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "삭제될 스레드 본문",
      authorId: "user-owner",
      authorName: "소유자"
    });
    const replied = await storage.addCommentReply("sample-file", created.threadId, {
      body: "삭제될 답글 본문",
      authorId: "user-replier",
      authorName: "답글 작성자"
    });

    await expect(
      storage.deleteCommentThread("sample-file", created.threadId, {
        actorId: "user-other",
        expectedModifiedAt: created.modifiedAt
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      storage.deleteCommentThread("sample-file", created.threadId, {
        actorId: "user-owner",
        expectedModifiedAt: "2026-01-01T00:00:00.000Z"
      })
    ).rejects.toMatchObject({ statusCode: 409 });

    await expect(
      storage.deleteCommentThread("sample-file", created.threadId, {
        actorId: "user-owner",
        expectedModifiedAt: replied.modifiedAt
      })
    ).resolves.toEqual({ threadId: created.threadId, deleted: true });
    await expect(storage.listCommentThreads("sample-file", { includeResolved: true })).resolves.toEqual([]);

    const sidecar = JSON.parse(await readFile(path.join(tempRoot, "comments", "sample-file.json"), "utf8"));
    expect(JSON.stringify(sidecar.activity)).not.toContain("삭제될 스레드 본문");
    expect(JSON.stringify(sidecar.activity)).not.toContain("삭제될 답글 본문");
    expect(sidecar.activity).toEqual([
      expect.objectContaining({
        type: "deleted",
        threadId: created.threadId,
        actorName: "소유자",
        body: "코멘트가 삭제되었습니다",
        mentions: [],
        mentionTargets: []
      })
    ]);
    expect(sidecar.events.at(-1)).toMatchObject({
      type: "deleted",
      threadId: created.threadId
    });
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

  test("agent commands create shadow tokens and bind node effect shadows", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: {
            id: "shadow-effects-card",
            name: "Effects / Card",
            type: "shadow",
            value: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
          }
        },
        { type: "set_effect_shadow_token", nodeId: "text-1", tokenId: "shadow-effects-card" }
      ] as any
    });
    const persisted = await storage.readFile("sample-file");
    const text = persisted.pages[0].children[0].children.find((node) => node.id === "text-1");

    expect(result.audit.commandTypes).toEqual(["create_token", "set_effect_shadow_token"]);
    expect(result.validation.issueCount).toBe(0);
    expect(persisted.tokens).toEqual([
      {
        id: "shadow-effects-card",
        name: "Effects / Card",
        type: "shadow",
        value: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
      }
    ]);
    expect(text?.style).toMatchObject({
      effect_shadow: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)",
      effect_shadow_token: "shadow-effects-card"
    });
  });

  test("agent commands create reusable effect styles and bind node effect shadows", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_style",
          style: {
            id: "style-effect-card-raised",
            name: "Effects / Card Raised",
            type: "effect",
            value: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
          }
        },
        {
          type: "set_effect_shadow_style",
          nodeId: "text-1",
          styleId: "style-effect-card-raised"
        }
      ] as any
    });
    const persisted = await storage.readFile("sample-file");
    const text = persisted.pages[0].children[0].children.find((node) => node.id === "text-1");

    expect(result.audit.commandTypes).toEqual(["create_style", "set_effect_shadow_style"]);
    expect(result.validation.issueCount).toBe(0);
    expect(persisted.styles).toEqual([
      {
        id: "style-effect-card-raised",
        name: "Effects / Card Raised",
        type: "effect",
        value: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
      }
    ]);
    expect(text?.style).toMatchObject({
      effect_shadow: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)",
      effect_shadow_style: "style-effect-card-raised"
    });
  });

  test("agent commands persist multi effect shadow stacks", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    const shadows = [
      "0px 1px 2px 0px rgba(15, 23, 42, 0.18)",
      "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
    ];

    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_style",
          style: {
            id: "style-effect-card-raised",
            name: "Effects / Card Raised",
            type: "effect",
            value: "0px 12px 24px 0px rgba(15, 23, 42, 0.24)"
          }
        },
        {
          type: "set_effect_shadow_style",
          nodeId: "text-1",
          styleId: "style-effect-card-raised"
        }
      ] as any
    });

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [{ type: "set_effect_shadows", nodeId: "text-1", shadows }] as any
    });
    const persisted = await storage.readFile("sample-file");
    const text = persisted.pages[0].children[0].children.find((node) => node.id === "text-1") as any;

    expect(result.audit.commandTypes).toEqual(["set_effect_shadows"]);
    expect(result.validation.issueCount).toBe(0);
    expect(text.style).toMatchObject({
      effect_shadow: shadows.join(", "),
      effect_shadows: shadows,
      effect_shadow_token: null,
      effect_shadow_style: null
    });
  });

  test("agent commands create reusable styles and apply them to selected node fields", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_style",
          style: {
            id: "style-color-brand-primary",
            name: "Brand / Primary",
            type: "color",
            value: "#2563eb"
          }
        },
        { type: "set_fill_style", nodeId: "text-1", styleId: "style-color-brand-primary" }
      ] as any
    });
    const persisted = await storage.readFile("sample-file");

    expect((result.preview as any).styles).toContainEqual(
      expect.objectContaining({ id: "style-color-brand-primary" })
    );
    expect(findNode(persisted, "text-1")?.style).toMatchObject({
      fill: "#2563eb",
      fill_style: "style-color-brand-primary"
    });
    expect(result.validation.issueCount).toBe(0);
    expect(result.audit.commandTypes).toEqual(["create_style", "set_fill_style"]);
  });

  test("manual fill updates clear reusable fill style bindings", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_style",
          style: {
            id: "style-color-brand-primary",
            name: "Brand / Primary",
            type: "color",
            value: "#2563eb"
          }
        },
        { type: "set_fill_style", nodeId: "text-1", styleId: "style-color-brand-primary" }
      ] as any
    });

    const updated = await storage.setNodeFill("sample-file", "text-1", "#111827");

    expect(updated.style).toMatchObject({
      fill: "#111827",
      fill_token: null,
      fill_style: null
    });
    expect(findNode(await storage.readFile("sample-file"), "text-1")?.style.fill_style).toBeNull();
  });

  test("agent commands rename and delete reusable styles with usage summaries", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const created = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_style",
          style: {
            id: "style-color-brand-primary",
            name: "Brand / Primary",
            type: "color",
            value: "#2563eb"
          }
        },
        { type: "set_fill_style", nodeId: "text-1", styleId: "style-color-brand-primary" }
      ] as any
    });
    expect((created.inspection.styles[0] as any).usageCount).toBe(1);
    expect((created.inspection.styles[0] as any).usedBy).toContainEqual(
      expect.objectContaining({ nodeId: "text-1", property: "fill_style" })
    );

    const renamed = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        { type: "rename_style", styleId: "style-color-brand-primary", name: "Brand / Accent" }
      ] as any
    });
    expect(renamed.preview.styles).toContainEqual(
      expect.objectContaining({ id: "style-color-brand-primary", name: "Brand / Accent" })
    );
    expect((renamed.inspection.styles[0] as any).usageCount).toBe(1);

    const deleted = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [{ type: "delete_style", styleId: "style-color-brand-primary" }] as any
    });
    const persistedText = findNode(await storage.readFile("sample-file"), "text-1");

    expect(deleted.preview.styles ?? []).not.toContainEqual(
      expect.objectContaining({ id: "style-color-brand-primary" })
    );
    expect(persistedText?.style).toMatchObject({
      fill: "#2563eb",
      fill_style: null
    });
    expect(deleted.validation.issueCount).toBe(0);
    expect(deleted.audit.commandTypes).toEqual(["delete_style"]);
  });

  test("agent commands duplicate reusable styles without carrying bindings", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_style",
          style: {
            id: "style-color-brand-primary",
            name: "Brand / Primary",
            type: "color",
            value: "#2563eb"
          }
        },
        { type: "set_fill_style", nodeId: "text-1", styleId: "style-color-brand-primary" }
      ] as any
    });

    const duplicated = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "duplicate_style",
          styleId: "style-color-brand-primary",
          newStyleId: "style-color-brand-accent",
          name: "Brand / Accent"
        }
      ] as any
    });

    expect(duplicated.preview.styles).toContainEqual(
      expect.objectContaining({
        id: "style-color-brand-accent",
        name: "Brand / Accent",
        type: "color",
        value: "#2563eb"
      })
    );
    expect((duplicated.inspection.styles as any[]).find((style) => style.id === "style-color-brand-primary")).toMatchObject({
      usageCount: 1
    });
    expect((duplicated.inspection.styles as any[]).find((style) => style.id === "style-color-brand-accent")).toMatchObject({
      usageCount: 0
    });
    expect(findNode(await storage.readFile("sample-file"), "text-1")?.style.fill_style).toBe(
      "style-color-brand-primary"
    );
    expect(duplicated.audit.commandTypes).toEqual(["duplicate_style"]);

    await expect(
      storage.applyAgentCommands("sample-file", {
        dryRun: false,
        commands: [
          {
            type: "duplicate_style",
            styleId: "style-color-missing",
            newStyleId: "style-color-missing-copy",
            name: "Missing / Copy"
          }
        ] as any
      })
    ).rejects.toThrow("style not found: style-color-missing");

    await expect(
      storage.applyAgentCommands("sample-file", {
        dryRun: false,
        commands: [
          {
            type: "duplicate_style",
            styleId: "style-color-brand-primary",
            newStyleId: "style-color-brand-accent",
            name: "Brand / Accent Again"
          }
        ] as any
      })
    ).rejects.toThrow("style already exists: style-color-brand-accent");
  });

  test("agent commands toggle token sets and rematerialize active color bindings", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    await storage.importTokensDtcg("sample-file", {
      $metadata: {
        tokenSetOrder: ["base", "dark"],
        activeTokenSets: ["base", "dark"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      },
      dark: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#93c5fd"
          }
        }
      }
    });

    const bound = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [{ type: "set_fill_token", nodeId: "text-1", tokenId: "color-base-brand-primary" }] as any
    });
    const activeText = bound.preview.pages[0].children[0].children[0] as any;

    expect(bound.preview.token_sets).toEqual([
      { id: "base", name: "base", enabled: true },
      { id: "dark", name: "dark", enabled: true }
    ]);
    expect(activeText.style).toMatchObject({
      fill: "#93c5fd",
      fill_token: "color-base-brand-primary"
    });

    const disabled = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [{ type: "set_token_set_enabled", tokenSetId: "dark", enabled: false }] as any
    });
    const disabledText = disabled.preview.pages[0].children[0].children[0] as any;
    const persisted = await storage.readFile("sample-file");

    expect(disabled.preview.token_sets).toEqual([
      { id: "base", name: "base", enabled: true },
      { id: "dark", name: "dark", enabled: false }
    ]);
    expect(disabledText.style).toMatchObject({
      fill: "#2563eb",
      fill_token: "color-base-brand-primary"
    });
    expect(persisted.token_sets?.find((set) => set.id === "dark")?.enabled).toBe(false);
    expect(disabled.validation.issueCount).toBe(0);
    expect(disabled.audit.commandTypes).toEqual(["set_token_set_enabled"]);
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

  test("component instance variant source tree persists after switching variants", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const component = await storage.createComponent("sample-file", "frame-1", {
      componentId: "component-1",
      name: "Card"
    });
    const primarySource = structuredClone(component.source_node);
    primarySource.name = "Card / Primary";
    primarySource.size = { width: 360, height: 220 };
    primarySource.children[0].content = {
      type: "text",
      value: "Primary source",
      font_size: 28,
      font_family: "Inter"
    };
    const secondarySource = structuredClone(component.source_node);
    secondarySource.name = "Card / Secondary";
    secondarySource.size = { width: 280, height: 180 };
    secondarySource.style = { ...secondarySource.style, fill: "#f8fafc", stroke: "#0f766e" };
    secondarySource.children[0].content = {
      type: "text",
      value: "Secondary source",
      font_size: 20,
      font_family: "Inter"
    };
    secondarySource.children.push({
      id: "badge-1",
      kind: "rectangle",
      name: "배지",
      transform: { x: 24, y: 104, rotation: 0 },
      size: { width: 80, height: 28 },
      style: { fill: "#ccfbf1", stroke: "#0f766e", stroke_width: 1, opacity: 1 },
      content: { type: "empty" },
      children: []
    });
    await storage.setComponentVariants(
      "sample-file",
      "component-1",
      [
        {
          id: "variant-primary",
          name: "Primary",
          properties: [{ name: "variant", value: "primary" }],
          source_node: primarySource
        },
        {
          id: "variant-secondary",
          name: "Secondary",
          properties: [{ name: "variant", value: "secondary" }],
          source_node: secondarySource
        }
      ] as any
    );

    const instance = await storage.createComponentInstance("sample-file", {
      parentId: "page-1",
      definitionId: "component-1",
      instanceId: "instance-1",
      x: 520,
      y: 140
    });
    expect(instance).toMatchObject({
      size: { width: 360, height: 220 },
      component_instance: { variant_id: "variant-primary" }
    });
    expect(findTextValue(await storage.readFile("sample-file"), "instance-1__text-1")).toBe("Primary source");

    await storage.updateText("sample-file", "instance-1__text-1", "Custom headline");
    const switched = await storage.setComponentInstanceVariant("sample-file", "instance-1", "variant-secondary");
    const persisted = await storage.readFile("sample-file");

    expect(switched).toMatchObject({
      size: { width: 280, height: 180 },
      style: { fill: "#f8fafc", stroke: "#0f766e" },
      component_instance: {
        variant_id: "variant-secondary",
        overrides: [{ node_id: "text-1", field: "text", value: "Custom headline" }]
      }
    });
    expect(findTextValue(persisted, "instance-1__text-1")).toBe("Custom headline");
    expect(findNode(persisted, "instance-1__badge-1")).toMatchObject({ kind: "rectangle", name: "배지" });
  });

  test("component variant area reflows stored source nodes and canvas nodes", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-secondary",
          name: "Button / Secondary",
          x: 340,
          y: 120,
          width: 180,
          height: 64,
          fill: "#0f766e"
        },
        {
          type: "create_component",
          nodeId: "frame-1",
          componentId: "component-primary",
          name: "Button / Primary"
        },
        {
          type: "create_component",
          nodeId: "button-secondary",
          componentId: "component-secondary",
          name: "Button / Secondary"
        },
        {
          type: "combine_components_as_variants",
          componentId: "component-primary",
          nodeIds: ["frame-1", "button-secondary"],
          propertyName: "variant"
        },
        {
          type: "set_component_variant_area",
          componentId: "component-primary",
          area: {
            layout: "vertical",
            gap: 48,
            padding: { top: 12, right: 16, bottom: 12, left: 16 }
          }
        }
      ]
    });

    const persisted = await storage.readFile("sample-file");
    const component = persisted.components?.find((candidate) => candidate.id === "component-primary") as any;

    expect(component.source_node.transform).toMatchObject({ x: 136, y: 92 });
    expect(component.variants[0].source_node.transform).toMatchObject({ x: 136, y: 92 });
    expect(component.variants[1].source_node.transform).toMatchObject({ x: 136, y: 420 });
    expect(findNode(persisted, "frame-1")?.transform).toMatchObject({ x: 136, y: 92 });
    expect(findNode(persisted, "button-secondary")?.transform).toMatchObject({ x: 136, y: 420 });
  });

  test("combine component variants reflows stored source nodes horizontally", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-secondary",
          name: "Button / Secondary",
          x: 340,
          y: 120,
          width: 180,
          height: 64,
          fill: "#0f766e"
        },
        {
          type: "create_component",
          nodeId: "frame-1",
          componentId: "component-primary",
          name: "Button / Primary"
        },
        {
          type: "create_component",
          nodeId: "button-secondary",
          componentId: "component-secondary",
          name: "Button / Secondary"
        },
        {
          type: "combine_components_as_variants",
          componentId: "component-primary",
          nodeIds: ["frame-1", "button-secondary"],
          propertyName: "variant"
        }
      ]
    });

    const persisted = await storage.readFile("sample-file");
    const component = persisted.components?.find((candidate) => candidate.id === "component-primary") as any;
    expect(component.variants[0].source_node.transform).toMatchObject({ x: 120, y: 80 });
    expect(component.variants[1].source_node.transform).toMatchObject({ x: 572, y: 80 });
    expect(findNode(persisted, "button-secondary")?.transform).toMatchObject({ x: 572, y: 80 });
  });

  test("setComponentVariantArea reflows persisted source nodes and canvas nodes", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-secondary",
          name: "Button / Secondary",
          x: 340,
          y: 120,
          width: 180,
          height: 64,
          fill: "#0f766e"
        },
        {
          type: "create_component",
          nodeId: "frame-1",
          componentId: "component-primary",
          name: "Button / Primary"
        }
      ]
    });
    const secondary = findNode(await storage.readFile("sample-file"), "button-secondary");
    await storage.setComponentVariants("sample-file", "component-primary", [
      {
        id: "variant-primary",
        name: "Primary",
        properties: [{ name: "variant", value: "Primary" }],
        source_node: structuredClone(findNode(await storage.readFile("sample-file"), "frame-1"))
      },
      {
        id: "variant-secondary",
        name: "Secondary",
        properties: [{ name: "variant", value: "Secondary" }],
        source_node: structuredClone(secondary)
      }
    ] as any);

    await storage.setComponentVariantArea("sample-file", "component-primary", {
      layout: "vertical",
      gap: 48,
      padding: { top: 12, right: 16, bottom: 12, left: 16 }
    });

    const persisted = await storage.readFile("sample-file");
    const component = persisted.components?.find((candidate) => candidate.id === "component-primary") as any;
    expect(component.source_node.transform).toMatchObject({ x: 136, y: 92 });
    expect(component.variants[0].source_node.transform).toMatchObject({ x: 136, y: 92 });
    expect(component.variants[1].source_node.transform).toMatchObject({ x: 136, y: 420 });
    expect(findNode(persisted, "frame-1")?.transform).toMatchObject({ x: 136, y: 92 });
    expect(findNode(persisted, "button-secondary")?.transform).toMatchObject({ x: 136, y: 420 });
  });

  test("setComponentVariants reflows persisted variant sources after reorder", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-secondary",
          name: "Button / Secondary",
          x: 340,
          y: 120,
          width: 180,
          height: 64,
          fill: "#0f766e"
        },
        {
          type: "create_component",
          nodeId: "frame-1",
          componentId: "component-primary",
          name: "Button / Primary"
        },
        {
          type: "create_component",
          nodeId: "button-secondary",
          componentId: "component-secondary",
          name: "Button / Secondary"
        },
        {
          type: "combine_components_as_variants",
          componentId: "component-primary",
          nodeIds: ["frame-1", "button-secondary"],
          propertyName: "variant"
        }
      ]
    });

    const combined = await storage.readFile("sample-file");
    const combinedComponent = combined.components?.find((candidate) => candidate.id === "component-primary") as any;
    await storage.setComponentVariants("sample-file", "component-primary", [
      combinedComponent.variants[1],
      combinedComponent.variants[0]
    ]);

    const persisted = await storage.readFile("sample-file");
    const component = persisted.components?.find((candidate) => candidate.id === "component-primary") as any;
    expect(component.variants.map((variant: any) => variant.id)).toEqual(["variant-button-secondary", "variant-frame-1"]);
    expect(component.source_node.id).toBe("button-secondary");
    expect(component.source_node.transform).toMatchObject({ x: 120, y: 80 });
    expect(component.variants[0].source_node.transform).toMatchObject({ x: 120, y: 80 });
    expect(component.variants[1].source_node.transform).toMatchObject({ x: 332, y: 80 });
    expect(findNode(persisted, "button-secondary")?.transform).toMatchObject({ x: 120, y: 80 });
    expect(findNode(persisted, "frame-1")?.transform).toMatchObject({ x: 332, y: 80 });
  });

  test("component instance fill overrides persist after switching variants", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const component = await storage.createComponent("sample-file", "frame-1", {
      componentId: "component-1",
      name: "Card"
    });
    const primarySource = structuredClone(component.source_node);
    primarySource.children[0].style = { ...primarySource.children[0].style, fill: "#111827" };
    const secondarySource = structuredClone(component.source_node);
    secondarySource.children[0].style = { ...secondarySource.children[0].style, fill: "#475569" };
    await storage.setComponentVariants(
      "sample-file",
      "component-1",
      [
        {
          id: "variant-primary",
          name: "Primary",
          properties: [{ name: "variant", value: "primary" }],
          source_node: primarySource
        },
        {
          id: "variant-secondary",
          name: "Secondary",
          properties: [{ name: "variant", value: "secondary" }],
          source_node: secondarySource
        }
      ] as any
    );

    await storage.createComponentInstance("sample-file", {
      parentId: "page-1",
      definitionId: "component-1",
      instanceId: "instance-1",
      x: 520,
      y: 140
    });
    await storage.setNodeFill("sample-file", "instance-1__text-1", "#f97316");
    const switched = await storage.setComponentInstanceVariant("sample-file", "instance-1", "variant-secondary");
    const persisted = await storage.readFile("sample-file");

    expect(findNode(persisted, "instance-1__text-1")?.style.fill).toBe("#f97316");
    expect(switched.component_instance).toMatchObject({
      variant_id: "variant-secondary",
      overrides: [{ node_id: "text-1", field: "fill", value: "#f97316" }]
    });
  });

  test("component instance geometry overrides persist after switching variants", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const component = await storage.createComponent("sample-file", "frame-1", {
      componentId: "component-1",
      name: "Card"
    });
    const primarySource = structuredClone(component.source_node);
    primarySource.children[0].transform = { x: 32, y: 40, rotation: 0 };
    primarySource.children[0].size = { width: 260, height: 48 };
    const secondarySource = structuredClone(component.source_node);
    secondarySource.children[0].transform = { x: 20, y: 28, rotation: 0 };
    secondarySource.children[0].size = { width: 180, height: 36 };
    await storage.setComponentVariants(
      "sample-file",
      "component-1",
      [
        {
          id: "variant-primary",
          name: "Primary",
          properties: [{ name: "variant", value: "primary" }],
          source_node: primarySource
        },
        {
          id: "variant-secondary",
          name: "Secondary",
          properties: [{ name: "variant", value: "secondary" }],
          source_node: secondarySource
        }
      ] as any
    );

    await storage.createComponentInstance("sample-file", {
      parentId: "page-1",
      definitionId: "component-1",
      instanceId: "instance-1",
      x: 520,
      y: 140
    });
    await storage.updateNodeGeometry("sample-file", "instance-1__text-1", {
      x: 44,
      y: 68,
      width: 310,
      height: 72
    });
    const switched = await storage.setComponentInstanceVariant("sample-file", "instance-1", "variant-secondary");
    const persisted = await storage.readFile("sample-file");

    expect(findNode(persisted, "instance-1__text-1")).toMatchObject({
      transform: { x: 44, y: 68 },
      size: { width: 310, height: 72 }
    });
    expect(switched.component_instance?.overrides).toEqual(
      expect.arrayContaining([
        { node_id: "text-1", field: "x", value: "44" },
        { node_id: "text-1", field: "y", value: "68" },
        { node_id: "text-1", field: "width", value: "310" },
        { node_id: "text-1", field: "height", value: "72" }
      ])
    );
  });

  test("agent commands preserve component instance style and geometry overrides after switching variants", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const component = await storage.createComponent("sample-file", "frame-1", {
      componentId: "component-1",
      name: "Card"
    });
    const primarySource = structuredClone(component.source_node);
    primarySource.children[0].transform = { x: 32, y: 40, rotation: 0 };
    primarySource.children[0].size = { width: 260, height: 48 };
    primarySource.children[0].style = {
      ...primarySource.children[0].style,
      stroke: "#111827",
      stroke_width: 1,
      opacity: 1
    };
    const secondarySource = structuredClone(component.source_node);
    secondarySource.children[0].transform = { x: 20, y: 28, rotation: 0 };
    secondarySource.children[0].size = { width: 180, height: 36 };
    secondarySource.children[0].style = {
      ...secondarySource.children[0].style,
      stroke: "#475569",
      stroke_width: 2,
      opacity: 0.8
    };
    await storage.setComponentVariants(
      "sample-file",
      "component-1",
      [
        {
          id: "variant-primary",
          name: "Primary",
          properties: [{ name: "variant", value: "primary" }],
          source_node: primarySource
        },
        {
          id: "variant-secondary",
          name: "Secondary",
          properties: [{ name: "variant", value: "secondary" }],
          source_node: secondarySource
        }
      ] as any
    );

    await storage.createComponentInstance("sample-file", {
      parentId: "page-1",
      definitionId: "component-1",
      instanceId: "instance-1",
      x: 520,
      y: 140
    });
    const result = await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "set_node_style",
          nodeId: "instance-1__text-1",
          style: {
            fill: "#111827",
            stroke: "#7c3aed",
            stroke_width: 3,
            opacity: 0.62
          }
        },
        {
          type: "update_geometry",
          nodeId: "instance-1__text-1",
          x: 44,
          y: 68,
          width: 310,
          height: 72
        }
      ] as any
    });
    const switched = await storage.setComponentInstanceVariant("sample-file", "instance-1", "variant-secondary");
    const persisted = await storage.readFile("sample-file");

    expect(result.audit.commandTypes).toEqual(["set_node_style", "update_geometry"]);
    expect(findNode(persisted, "instance-1__text-1")).toMatchObject({
      transform: { x: 44, y: 68 },
      size: { width: 310, height: 72 },
      style: { stroke: "#7c3aed", stroke_width: 3, opacity: 0.62 }
    });
    expect(switched.component_instance?.overrides).toEqual(
      expect.arrayContaining([
        { node_id: "text-1", field: "stroke", value: "#7c3aed" },
        { node_id: "text-1", field: "stroke_width", value: "3" },
        { node_id: "text-1", field: "opacity", value: "0.62" },
        { node_id: "text-1", field: "x", value: "44" },
        { node_id: "text-1", field: "y", value: "68" },
        { node_id: "text-1", field: "width", value: "310" },
        { node_id: "text-1", field: "height", value: "72" }
      ])
    );
  });

  test("agent commands preserve component instance effect shadow overrides after switching variants", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-"));
    const storage = await storageWithDocument(tempRoot);

    const component = await storage.createComponent("sample-file", "frame-1", {
      componentId: "component-1",
      name: "Card"
    });
    const primarySource = structuredClone(component.source_node);
    primarySource.children[0].style = {
      ...primarySource.children[0].style,
      effect_shadow: "0 4px 10px rgba(15, 23, 42, 0.16)"
    } as any;
    const secondarySource = structuredClone(component.source_node);
    secondarySource.children[0].style = {
      ...secondarySource.children[0].style,
      effect_shadow: "0 1px 2px rgba(15, 23, 42, 0.08)"
    } as any;
    await storage.setComponentVariants(
      "sample-file",
      "component-1",
      [
        {
          id: "variant-primary",
          name: "Primary",
          properties: [{ name: "surface", value: "raised" }],
          source_node: primarySource
        },
        {
          id: "variant-secondary",
          name: "Secondary",
          properties: [{ name: "surface", value: "flat" }],
          source_node: secondarySource
        }
      ] as any
    );

    await storage.createComponentInstance("sample-file", {
      parentId: "page-1",
      definitionId: "component-1",
      instanceId: "instance-1",
      x: 520,
      y: 140
    });
    await storage.applyAgentCommands("sample-file", {
      dryRun: false,
      commands: [
        {
          type: "set_node_style",
          nodeId: "instance-1__text-1",
          style: {
            ...findNode(await storage.readFile("sample-file"), "instance-1__text-1")!.style,
            effect_shadow: "0 18px 36px rgba(15, 23, 42, 0.32)"
          }
        }
      ] as any
    });

    const switched = await storage.setComponentInstanceVariant("sample-file", "instance-1", "variant-secondary");
    const persisted = await storage.readFile("sample-file");

    expect((findNode(persisted, "instance-1__text-1") as any)?.style.effect_shadow).toBe(
      "0 18px 36px rgba(15, 23, 42, 0.32)"
    );
    expect(switched.component_instance?.overrides).toEqual(
      expect.arrayContaining([
        {
          node_id: "text-1",
          field: "effect_shadow",
          value: "0 18px 36px rgba(15, 23, 42, 0.32)"
        }
      ])
    );
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
      { type: "set_text_orientation", nodeId: "text-1", textOrientation: "sideways" },
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
    writing_mode: "vertical_rl",
    text_orientation: "sideways"
  });
  expect(verticalBaselineFrame.children.find((node) => node.id === "text-1")?.transform).toMatchObject({
    x: 20,
    y: 20
  });
  expect(verticalBaselineFrame.children.find((node) => node.id === "vertical-caption-1")?.transform).toMatchObject({
    x: 70,
    y: 103
  });
  expect(verticalBaselineLayout.audit.commandTypes).toContain("set_text_writing_mode");
  expect(verticalBaselineLayout.audit.commandTypes).toContain("set_text_orientation");

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

function findNode(document: Awaited<ReturnType<FileStorage["readFile"]>>, nodeId: string) {
  const stack = document.pages.flatMap((page) => page.children);
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) {
      continue;
    }
    if (node.id === nodeId) {
      return node;
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

function imageNodeForAsset(assetId: string, nodeId: string) {
  return {
    id: nodeId,
    kind: "image" as const,
    name: "Image",
    transform: { x: 120, y: 140, rotation: 0 },
    size: { width: 160, height: 120 },
    style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
    content: {
      type: "image" as const,
      asset_id: assetId,
      natural_width: 1,
      natural_height: 1,
      fit_mode: "fit" as const
    },
    children: []
  };
}
