import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FileStorage } from "./storage";
import {
  createStorageBackupArchive,
  listStorageBackupRepository,
  pruneStorageBackupRepository,
  runStorageRestoreDrill,
  restoreStorageBackupArchive,
  reviewStorageBackupArchive,
  writeStorageBackupToRepository
} from "./storage-backup";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("storage backup archive", () => {
  test("backs up reviews and restores the full local storage root", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-backup-"));
    const sourceRoot = path.join(tempRoot, "source");
    const targetRoot = path.join(tempRoot, "target");
    const source = await storageWithDocument(sourceRoot);
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64"
    );
    const asset = await source.createAsset({
      name: "backup.png",
      mimeType: "image/png",
      dataBase64: pngBytes.toString("base64")
    });
    await source.saveFileVersion("sample-file", { message: "릴리즈 기준" });
    const comment = await source.createCommentThread("sample-file", {
      nodeId: "text-1",
      body: "@사용자 백업 검증",
      authorName: "운영자",
      mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
    });
    const library = await source.publishLibraryToRegistry("sample-file", {
      libraryId: "team-kit",
      name: "Team Kit"
    });

    const archive = await createStorageBackupArchive(sourceRoot);
    const review = reviewStorageBackupArchive(archive);
    expect(review).toMatchObject({
      schemaVersion: 1,
      storageDirectory: ".layo",
      fileCount: expect.any(Number),
      totalBytes: expect.any(Number)
    });
    expect(review.directories).toEqual(
      expect.arrayContaining(["assets", "comments", "files", "history", "libraries", "projects"])
    );
    expect(review.entries).toEqual(
      expect.arrayContaining([
        "storage/files/sample-file.json",
        `storage/assets/${asset.assetId}`,
        `storage/assets/${asset.assetId}.json`,
        "storage/comments/sample-file.json",
        "storage/libraries/registry.json",
        "storage/libraries/team-kit.layo-library.zip",
        "storage/projects/test-project.json"
      ])
    );

    const restoredReview = await restoreStorageBackupArchive(archive, targetRoot);
    expect(restoredReview).toMatchObject({
      fileCount: review.fileCount,
      totalBytes: review.totalBytes
    });

    const restored = new FileStorage(targetRoot);
    await expect(restored.readProject("test-project")).resolves.toMatchObject({
      projectId: "test-project",
      currentDocumentId: "sample-file"
    });
    await expect(restored.readFile("sample-file")).resolves.toMatchObject({
      id: "sample-file",
      name: "테스트 문서"
    });
    await expect(restored.readAsset(asset.assetId)).resolves.toMatchObject({
      assetId: asset.assetId,
      mimeType: "image/png",
      data: pngBytes
    });
    await expect(restored.listFileVersions("sample-file")).resolves.toEqual([
      expect.objectContaining({ message: "릴리즈 기준" })
    ]);
    await expect(restored.listCommentThreads("sample-file", { includeResolved: true })).resolves.toEqual([
      expect.objectContaining({
        threadId: comment.threadId,
        body: "@사용자 백업 검증",
        mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
      })
    ]);
    await expect(restored.listLibraryRegistry("sample-file")).resolves.toEqual([
      expect.objectContaining({ libraryId: library.libraryId, name: "Team Kit" })
    ]);
  });

  test("refuses to restore over an existing storage root unless forced", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-backup-"));
    const sourceRoot = path.join(tempRoot, "source");
    const targetRoot = path.join(tempRoot, "target");
    await storageWithDocument(sourceRoot);
    await storageWithDocument(targetRoot);

    const archive = await createStorageBackupArchive(sourceRoot);

    await expect(restoreStorageBackupArchive(archive, targetRoot)).rejects.toThrow(
      "target storage root is not empty"
    );
    await expect(restoreStorageBackupArchive(archive, targetRoot, { force: true })).resolves.toMatchObject({
      schemaVersion: 1
    });
    await expect(new FileStorage(targetRoot).readProject("test-project")).resolves.toMatchObject({
      currentDocumentId: "sample-file"
    });
  });

  test("runs a restore drill that proves expected project and file can be read", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-backup-"));
    const sourceRoot = path.join(tempRoot, "source");
    const workDir = path.join(tempRoot, "drill");
    const source = await storageWithDocument(sourceRoot);
    await source.saveFileVersion("sample-file", { message: "restore drill baseline" });

    const drill = await runStorageRestoreDrill(sourceRoot, {
      workDir,
      expectProjectId: "test-project",
      expectFileId: "sample-file"
    });

    expect(drill.review.entries).toEqual(
      expect.arrayContaining([
        "storage/files/sample-file.json",
        "storage/history/sample-file/" + drill.checks.expectedFileVersionIds[0] + ".json",
        "storage/projects/test-project.json"
      ])
    );
    expect(drill.restoreRoot).toBe(path.join(workDir, "restore"));
    expect(drill.checks).toMatchObject({
      projectCount: 1,
      expectedProjectId: "test-project",
      expectedProjectFound: true,
      expectedFileId: "sample-file",
      expectedFileFound: true,
      expectedFileVersionCount: 1
    });
  });

  test("writes and lists local backup repository archives newest first", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-backup-"));
    const sourceRoot = path.join(tempRoot, "source");
    const repositoryRoot = path.join(tempRoot, "backups");
    await storageWithDocument(sourceRoot);

    const older = await writeStorageBackupToRepository(sourceRoot, repositoryRoot, {
      backupId: "older",
      createdAt: new Date("2026-06-25T00:00:00.000Z")
    });
    const newer = await writeStorageBackupToRepository(sourceRoot, repositoryRoot, {
      backupId: "newer",
      createdAt: new Date("2026-06-28T00:00:00.000Z")
    });

    expect(older.archivePath).toBe(path.join(repositoryRoot, "older.zip"));
    expect(newer.archivePath).toBe(path.join(repositoryRoot, "newer.zip"));
    await expect(listStorageBackupRepository(repositoryRoot)).resolves.toMatchObject([
      { backupId: "newer", createdAt: "2026-06-28T00:00:00.000Z", fileCount: expect.any(Number) },
      { backupId: "older", createdAt: "2026-06-25T00:00:00.000Z", fileCount: expect.any(Number) }
    ]);
  });

  test("dry-runs and prunes backup repository archives by retention policy", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-backup-"));
    const sourceRoot = path.join(tempRoot, "source");
    const repositoryRoot = path.join(tempRoot, "backups");
    await storageWithDocument(sourceRoot);
    for (const [backupId, createdAt] of [
      ["oldest", "2026-06-20T00:00:00.000Z"],
      ["middle", "2026-06-24T00:00:00.000Z"],
      ["newest", "2026-06-28T00:00:00.000Z"]
    ] as const) {
      await writeStorageBackupToRepository(sourceRoot, repositoryRoot, { backupId, createdAt: new Date(createdAt) });
    }

    const dryRun = await pruneStorageBackupRepository(repositoryRoot, {
      keepLast: 2,
      maxAgeDays: 3,
      now: new Date("2026-06-28T12:00:00.000Z"),
      dryRun: true
    });
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.deleted.map((entry) => entry.backupId)).toEqual(["oldest"]);
    expect(dryRun.kept.map((entry) => entry.backupId)).toEqual(["newest", "middle"]);
    await expect(listStorageBackupRepository(repositoryRoot)).resolves.toHaveLength(3);

    const pruned = await pruneStorageBackupRepository(repositoryRoot, {
      keepLast: 2,
      maxAgeDays: 3,
      now: new Date("2026-06-28T12:00:00.000Z")
    });
    expect(pruned.deleted.map((entry) => entry.backupId)).toEqual(["oldest"]);
    await expect(listStorageBackupRepository(repositoryRoot)).resolves.toMatchObject([
      { backupId: "newest" },
      { backupId: "middle" }
    ]);
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
