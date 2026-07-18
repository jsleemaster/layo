import { readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const storageMarkerName = ".layo-e2e-root";

const removalOptions = {
  recursive: true,
  force: true,
  maxRetries: 10,
  retryDelay: 50
} as const;

export async function resetE2eStorage() {
  const storageRoot = process.env.LAYO_E2E_STORAGE_DIR?.trim();
  const storageToken = process.env.LAYO_E2E_STORAGE_TOKEN?.trim();
  if (!storageRoot || !storageToken) {
    throw new Error(
      "LAYO_E2E_STORAGE_DIR and LAYO_E2E_STORAGE_TOKEN are required; run Playwright through scripts/run-e2e.mjs"
    );
  }
  const canonicalRoot = await assertOwnedE2eStorageRoot(storageRoot, storageToken);
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await removeStorageEntries(canonicalRoot);
      await delay(75);
      if ((await storageEntries(canonicalRoot)).length > 0) {
        continue;
      }

      await delay(75);
      if ((await storageEntries(canonicalRoot)).length === 0) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error("E2E storage did not stabilize after repeated cleanup", { cause: lastError });
}

async function assertOwnedE2eStorageRoot(storageRoot: string, storageToken: string) {
  const [canonicalRoot, canonicalTempRoot] = await Promise.all([
    realpath(storageRoot),
    realpath(tmpdir())
  ]);
  const relativeRoot = path.relative(canonicalTempRoot, canonicalRoot);
  if (
    !relativeRoot ||
    relativeRoot.startsWith(`..${path.sep}`) ||
    relativeRoot === ".." ||
    path.isAbsolute(relativeRoot) ||
    !path.basename(canonicalRoot).startsWith("layo-e2e-")
  ) {
    throw new Error("E2E storage root must be a runner-owned system temporary directory");
  }

  const marker = await readFile(path.join(canonicalRoot, storageMarkerName), "utf8");
  if (marker !== storageToken) {
    throw new Error("E2E storage ownership marker does not match this runner");
  }
  return canonicalRoot;
}

async function removeStorageEntries(storageRoot: string) {
  for (const entry of await storageEntries(storageRoot)) {
    await rm(path.join(storageRoot, entry), removalOptions);
  }
}

async function storageEntries(storageRoot: string) {
  return (await readdir(storageRoot)).filter((entry) => entry !== storageMarkerName);
}
