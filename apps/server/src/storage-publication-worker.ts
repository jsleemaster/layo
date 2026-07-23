import { access, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { FileStorage } from "./storage.js";

const [mode, root, firstArg, secondArg, thirdArg, fourthArg] = process.argv.slice(2);
if (!mode || !root) {
  throw new Error("storage worker mode and root are required");
}

const requiredArg = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`storage worker argument is required: ${name}`);
  }
  return value;
};

const crash = (marker: string, exitCode: number): Promise<never> =>
  new Promise<never>(() => {
    process.stdout.write(`${marker}\n`, () => process.exit(exitCode));
  });

const waitForRelease = async (releasePath: string): Promise<void> => {
  while (true) {
    try {
      await access(releasePath);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }
      await delay(20);
    }
  }
};

const storage = new FileStorage(root);

if (
  mode === "publish"
  || mode === "publish-paused"
  || mode === "publish-crash-after-archive"
) {
  const fileId = requiredArg(firstArg, "fileId");
  const libraryId = requiredArg(secondArg, "libraryId");
  const releasePath = requiredArg(thirdArg, "releasePath");

  if (mode === "publish-paused") {
    const internals = storage as unknown as {
      writeLibraryRegistryEntries(entries: unknown[]): Promise<void>;
    };
    const originalWriteEntries =
      internals.writeLibraryRegistryEntries.bind(storage);
    internals.writeLibraryRegistryEntries = async (entries) => {
      process.stdout.write("publish-paused\n");
      await waitForRelease(releasePath);
      await originalWriteEntries(entries);
    };
  } else if (mode === "publish-crash-after-archive") {
    const internals = storage as unknown as {
      writeLibraryRegistryEntries(entries: unknown[]): Promise<void>;
    };
    internals.writeLibraryRegistryEntries = () =>
      crash("publish-crashing", 86);
  }

  await storage.publishLibraryToRegistry(fileId, { libraryId });
  process.stdout.write("publish-done\n");
} else if (mode === "file-import-crash-after-file") {
  const archivePath = requiredArg(firstArg, "archivePath");
  const fileId = requiredArg(secondArg, "fileId");
  const internals = storage as unknown as {
    writeFileDurablyWithoutMutationLock(
      targetFileId: string,
      document: unknown
    ): Promise<void>;
  };
  const originalWriteFile =
    internals.writeFileDurablyWithoutMutationLock.bind(storage);
  internals.writeFileDurablyWithoutMutationLock = async (
    targetFileId,
    document
  ) => {
    await originalWriteFile(targetFileId, document);
    await crash("file-import-crashing", 87);
  };
  await storage.importFileArchive(await readFile(archivePath), { fileId });
} else if (mode === "project-import-crash-after-project") {
  const archivePath = requiredArg(firstArg, "archivePath");
  const projectId = requiredArg(secondArg, "projectId");
  const documentIdPrefix = requiredArg(thirdArg, "documentIdPrefix");
  const internals = storage as unknown as {
    writeProject(project: unknown): Promise<unknown>;
  };
  const originalWriteProject = internals.writeProject.bind(storage);
  internals.writeProject = async (project) => {
    const result = await originalWriteProject(project);
    await crash("project-import-crashing", 88);
    return result;
  };
  await storage.importProjectArchive(await readFile(archivePath), {
    projectId,
    documentIdPrefix
  });
} else if (mode === "project-import-crash-after-journal-remove") {
  const archivePath = requiredArg(firstArg, "archivePath");
  const projectId = requiredArg(secondArg, "projectId");
  const documentIdPrefix = requiredArg(thirdArg, "documentIdPrefix");
  const idempotencyKey = requiredArg(fourthArg, "idempotencyKey");
  const internals = storage as unknown as {
    removeStorageTransactionRecoveryJournal(transactionId: string): Promise<void>;
  };
  const originalRemove =
    internals.removeStorageTransactionRecoveryJournal.bind(storage);
  internals.removeStorageTransactionRecoveryJournal = async (
    transactionId
  ) => {
    await originalRemove(transactionId);
    await crash("project-import-response-crashing", 91);
  };
  await storage.importProjectArchive(await readFile(archivePath), {
    projectId,
    documentIdPrefix,
    idempotencyKey
  } as Parameters<FileStorage["importProjectArchive"]>[1]);
} else if (mode === "project-duplicate-crash-after-project") {
  const sourceProjectId = requiredArg(firstArg, "sourceProjectId");
  const projectId = requiredArg(secondArg, "projectId");
  const documentIdPrefix = requiredArg(thirdArg, "documentIdPrefix");
  const internals = storage as unknown as {
    writeProject(project: unknown): Promise<unknown>;
  };
  const originalWriteProject = internals.writeProject.bind(storage);
  internals.writeProject = async (project) => {
    const result = await originalWriteProject(project);
    await crash("project-duplicate-crashing", 90);
    return result;
  };
  await storage.duplicateProject(sourceProjectId, {
    projectId,
    documentIdPrefix
  });
} else if (mode === "library-update-crash-after-commit") {
  const fileId = requiredArg(firstArg, "fileId");
  const libraryId = requiredArg(secondArg, "libraryId");
  const internals = storage as unknown as {
    removeLibraryUpdateRecoveryJournal(fileId: string): Promise<void>;
  };
  internals.removeLibraryUpdateRecoveryJournal = () =>
    crash("library-update-crashing", 93);
  await storage.updateLibraryRegistryItem(fileId, libraryId);
} else if (mode === "external-import-crash-after-publication") {
  const archivePath = requiredArg(firstArg, "archivePath");
  const projectId = requiredArg(secondArg, "projectId");
  const documentId = requiredArg(thirdArg, "documentId");
  const internals = storage as unknown as {
    publishLibraryToRegistryLocked(
      fileId: string,
      options?: unknown,
      onPrepared?: (snapshots: readonly unknown[]) => Promise<void>
    ): Promise<unknown>;
  };
  const originalPublish =
    internals.publishLibraryToRegistryLocked.bind(storage);
  internals.publishLibraryToRegistryLocked = async (
    fileId,
    options,
    onPrepared
  ) => {
    const result = await originalPublish(
      fileId,
      options,
      onPrepared
    );
    await crash("external-import-crashing", 89);
    return result;
  };
  await storage.importExternalMigrationArchive(await readFile(archivePath), {
    projectId,
    documentId,
    fileName: pathBaseName(archivePath)
  });
} else if (mode === "external-import-crash-after-journal-remove") {
  const archivePath = requiredArg(firstArg, "archivePath");
  const projectId = requiredArg(secondArg, "projectId");
  const documentId = requiredArg(thirdArg, "documentId");
  const idempotencyKey = requiredArg(fourthArg, "idempotencyKey");
  const internals = storage as unknown as {
    removeStorageTransactionRecoveryJournal(transactionId: string): Promise<void>;
  };
  const originalRemove =
    internals.removeStorageTransactionRecoveryJournal.bind(storage);
  internals.removeStorageTransactionRecoveryJournal = async (
    transactionId
  ) => {
    await originalRemove(transactionId);
    await crash("external-import-response-crashing", 92);
  };
  await storage.importExternalMigrationArchive(await readFile(archivePath), {
    projectId,
    documentId,
    fileName: pathBaseName(archivePath),
    idempotencyKey
  } as Parameters<FileStorage["importExternalMigrationArchive"]>[1]);
} else {
  throw new Error(`unknown storage worker mode: ${mode}`);
}

function pathBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? "migration.penpot";
}
