import { access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { FileStorage } from "./storage.js";

const [mode, root, targetFileId, libraryId, releasePath] = process.argv.slice(2);
if (!mode || !root || !targetFileId || !releasePath) {
  throw new Error("storage process lock worker arguments are incomplete");
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

if (mode === "update") {
  if (!libraryId) {
    throw new Error("library update worker requires a library id");
  }
  const internals = storage as unknown as {
    writeLibraryRegistrySubscriptions(subscriptions: unknown[]): Promise<void>;
  };
  const originalWriteSubscriptions =
    internals.writeLibraryRegistrySubscriptions.bind(storage);
  internals.writeLibraryRegistrySubscriptions = async (subscriptions) => {
    process.stdout.write("update-paused\n");
    await waitForRelease();
    await originalWriteSubscriptions(subscriptions);
  };
  await storage.updateLibraryRegistryItem(targetFileId, libraryId);
  process.stdout.write("update-done\n");
} else if (mode === "write") {
  const document = await storage.readFile(targetFileId);
  document.name = "Concurrent process write";
  process.stdout.write("write-ready\n");
  await storage.writeFile(targetFileId, document);
  process.stdout.write("write-done\n");
} else {
  throw new Error(`unknown storage process lock worker mode: ${mode}`);
}
