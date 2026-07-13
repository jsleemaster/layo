import { access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { FileStorage } from "./storage.js";

const [mode, root, fileId, libraryId, releasePath] = process.argv.slice(2);
if (!mode || !root || !fileId || !libraryId || !releasePath) {
  throw new Error("storage publication worker arguments are incomplete");
}

const waitForRelease = async (): Promise<void> => {
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
if (mode === "publish-paused") {
  const internals = storage as unknown as {
    writeLibraryRegistryEntries(entries: unknown[]): Promise<void>;
  };
  const originalWriteEntries = internals.writeLibraryRegistryEntries.bind(storage);
  internals.writeLibraryRegistryEntries = async (entries) => {
    process.stdout.write("publish-paused\n");
    await waitForRelease();
    await originalWriteEntries(entries);
  };
} else if (mode === "publish-crash-after-archive") {
  const internals = storage as unknown as {
    writeLibraryRegistryEntries(entries: unknown[]): Promise<void>;
  };
  internals.writeLibraryRegistryEntries = async () => {
    process.stdout.write("publish-crashing\n", () => process.exit(86));
    await new Promise<never>(() => undefined);
  };
} else if (mode !== "publish") {
  throw new Error(`unknown storage publication worker mode: ${mode}`);
}

await storage.publishLibraryToRegistry(fileId, { libraryId });
process.stdout.write("publish-done\n");
