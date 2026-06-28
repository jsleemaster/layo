import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createZipArchive, readZipArchive, type ZipArchiveEntry } from "./file-archive.js";
import { FileStorage } from "./storage.js";

export interface StorageBackupManifest {
  schemaVersion: 1;
  product: "Layo";
  storageDirectory: ".layo";
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  entries: string[];
}

export interface StorageBackupReview extends StorageBackupManifest {
  directories: string[];
}

export interface StorageRestoreDrillOptions {
  workDir?: string;
  expectProjectId?: string;
  expectFileId?: string;
}

export interface StorageRestoreDrillResult {
  review: StorageBackupReview;
  restoreRoot: string;
  checks: {
    projectCount: number;
    expectedProjectId?: string;
    expectedProjectFound?: boolean;
    expectedFileId?: string;
    expectedFileFound?: boolean;
    expectedFileVersionCount?: number;
    expectedFileVersionIds: string[];
  };
}

const MANIFEST_ENTRY_PATH = "manifest.json";
const STORAGE_ENTRY_PREFIX = "storage/";

export async function createStorageBackupArchive(rootDir: string): Promise<Buffer> {
  const storageEntries = await collectStorageEntries(rootDir);
  const manifest: StorageBackupManifest = {
    schemaVersion: 1,
    product: "Layo",
    storageDirectory: ".layo",
    createdAt: new Date().toISOString(),
    fileCount: storageEntries.length,
    totalBytes: storageEntries.reduce((total, entry) => total + entry.data.length, 0),
    entries: storageEntries.map((entry) => entry.path)
  };

  return createZipArchive([
    {
      path: MANIFEST_ENTRY_PATH,
      data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    },
    ...storageEntries
  ]);
}

export function reviewStorageBackupArchive(archive: Buffer): StorageBackupReview {
  const entries = readZipArchive(archive);
  const manifest = parseStorageBackupManifest(entries.get(MANIFEST_ENTRY_PATH));
  const storageEntries = [...entries.keys()].filter((entryPath) => entryPath.startsWith(STORAGE_ENTRY_PREFIX));
  const unknownEntries = [...entries.keys()].filter(
    (entryPath) => entryPath !== MANIFEST_ENTRY_PATH && !entryPath.startsWith(STORAGE_ENTRY_PREFIX)
  );
  if (unknownEntries.length > 0) {
    throw new Error(`unsupported backup archive entry: ${unknownEntries[0]}`);
  }
  if (!arraysEqual(storageEntries, manifest.entries)) {
    throw new Error("backup manifest entries do not match archive entries");
  }

  const totalBytes = storageEntries.reduce((total, entryPath) => {
    const data = entries.get(entryPath);
    return total + (data?.length ?? 0);
  }, 0);
  if (manifest.fileCount !== storageEntries.length || manifest.totalBytes !== totalBytes) {
    throw new Error("backup manifest size summary does not match archive entries");
  }

  return {
    ...manifest,
    directories: directoriesForStorageEntries(storageEntries)
  };
}

export async function restoreStorageBackupArchive(
  archive: Buffer,
  targetRootDir: string,
  options: { force?: boolean } = {}
): Promise<StorageBackupReview> {
  const review = reviewStorageBackupArchive(archive);
  const entries = readZipArchive(archive);

  if (await pathExists(targetRootDir)) {
    if (!options.force && !(await isEmptyDirectory(targetRootDir))) {
      throw new Error("target storage root is not empty");
    }
    if (options.force) {
      await rm(targetRootDir, { recursive: true, force: true });
    }
  }

  await mkdir(targetRootDir, { recursive: true });
  const resolvedTargetRoot = path.resolve(targetRootDir);
  for (const entryPath of review.entries) {
    const relativePath = entryPath.slice(STORAGE_ENTRY_PREFIX.length);
    const destination = path.resolve(targetRootDir, relativePath);
    if (destination !== resolvedTargetRoot && !destination.startsWith(`${resolvedTargetRoot}${path.sep}`)) {
      throw new Error("unsafe backup restore path");
    }
    const data = entries.get(entryPath);
    if (!data) {
      throw new Error(`missing backup archive entry: ${entryPath}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }

  return review;
}

export async function runStorageRestoreDrill(
  rootDir: string,
  options: StorageRestoreDrillOptions = {}
): Promise<StorageRestoreDrillResult> {
  const archive = await createStorageBackupArchive(rootDir);
  const workDir = options.workDir ?? (await mkdtemp(path.join(tmpdir(), "layo-restore-drill-")));
  const restoreRoot = path.join(workDir, "restore");
  await rm(restoreRoot, { recursive: true, force: true });
  const review = await restoreStorageBackupArchive(archive, restoreRoot);
  const restoredStorage = new FileStorage(restoreRoot);
  const projects = await restoredStorage.listProjects();

  let expectedProjectFound: boolean | undefined;
  if (options.expectProjectId) {
    await restoredStorage.readProject(options.expectProjectId);
    expectedProjectFound = true;
  }

  let expectedFileFound: boolean | undefined;
  let expectedFileVersionCount: number | undefined;
  let expectedFileVersionIds: string[] = [];
  if (options.expectFileId) {
    await restoredStorage.readFile(options.expectFileId);
    expectedFileFound = true;
    const versions = await restoredStorage.listFileVersions(options.expectFileId);
    expectedFileVersionCount = versions.length;
    expectedFileVersionIds = versions.map((version) => version.versionId);
  }

  return {
    review,
    restoreRoot,
    checks: {
      projectCount: projects.length,
      expectedProjectId: options.expectProjectId,
      expectedProjectFound,
      expectedFileId: options.expectFileId,
      expectedFileFound,
      expectedFileVersionCount,
      expectedFileVersionIds
    }
  };
}

async function collectStorageEntries(rootDir: string): Promise<ZipArchiveEntry[]> {
  if (!(await pathExists(rootDir))) {
    return [];
  }

  const resolvedRoot = path.resolve(rootDir);
  const entries: ZipArchiveEntry[] = [];
  await collectStorageEntriesInto(resolvedRoot, resolvedRoot, entries);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

async function collectStorageEntriesInto(
  resolvedRoot: string,
  currentDir: string,
  entries: ZipArchiveEntry[]
): Promise<void> {
  const children = await readdir(currentDir, { withFileTypes: true });
  children.sort((a, b) => a.name.localeCompare(b.name));

  for (const child of children) {
    const childPath = path.join(currentDir, child.name);
    if (child.isDirectory()) {
      await collectStorageEntriesInto(resolvedRoot, childPath, entries);
      continue;
    }
    if (!child.isFile()) {
      continue;
    }

    const relativePath = path.relative(resolvedRoot, childPath).split(path.sep).join("/");
    entries.push({
      path: `${STORAGE_ENTRY_PREFIX}${relativePath}`,
      data: await readFile(childPath)
    });
  }
}

function parseStorageBackupManifest(rawManifest: Buffer | undefined): StorageBackupManifest {
  if (!rawManifest) {
    throw new Error("backup manifest is missing");
  }
  const parsed = JSON.parse(rawManifest.toString("utf8")) as Partial<StorageBackupManifest>;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.product !== "Layo" ||
    parsed.storageDirectory !== ".layo" ||
    typeof parsed.createdAt !== "string" ||
    !Array.isArray(parsed.entries) ||
    typeof parsed.fileCount !== "number" ||
    !Number.isInteger(parsed.fileCount) ||
    typeof parsed.totalBytes !== "number" ||
    !Number.isInteger(parsed.totalBytes)
  ) {
    throw new Error("invalid backup manifest");
  }

  const fileCount = parsed.fileCount;
  const totalBytes = parsed.totalBytes;
  const entries = parsed.entries.map((entry) => {
    if (typeof entry !== "string" || !entry.startsWith(STORAGE_ENTRY_PREFIX)) {
      throw new Error("invalid backup manifest entry");
    }
    return entry;
  });

  return {
    schemaVersion: 1,
    product: "Layo",
    storageDirectory: ".layo",
    createdAt: parsed.createdAt,
    fileCount,
    totalBytes,
    entries
  };
}

function directoriesForStorageEntries(entries: string[]): string[] {
  return [
    ...new Set(
      entries
        .map((entryPath) => entryPath.slice(STORAGE_ENTRY_PREFIX.length).split("/")[0])
        .filter((directory) => directory.length > 0)
    )
  ].sort((a, b) => a.localeCompare(b));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function isEmptyDirectory(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory);
    return entries.length === 0;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
