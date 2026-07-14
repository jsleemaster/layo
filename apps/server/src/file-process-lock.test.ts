import { existsSync } from "node:fs";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  fileProcessMutationLockPath,
  withFileProcessMutationLock
} from "./file-process-lock";

describe("file process mutation lock", () => {
  test("recovers an abandoned same-host process lock before the bounded timeout", async () => {
    const root = await createRoot();
    const resourcePath = path.join(root, "members.json");
    const lockPath = fileProcessMutationLockPath(resourcePath);
    try {
      await writeLock(lockPath, {
        token: "abandoned-owner",
        pid: 99_999_999,
        acquiredAt: "2026-07-14T00:00:00.000Z"
      });
      await link(
        path.join(lockPath, "owner.json"),
        `${lockPath}.recovery-abandoned-owner.claim`
      );

      await expect(
        withFileProcessMutationLock(
          resourcePath,
          async () => "recovered",
          { timeoutMs: 500, staleMs: 50, retryMs: 5 }
        )
      ).resolves.toBe("recovered");
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not steal a live process lock when the wait times out", async () => {
    const root = await createRoot();
    const resourcePath = path.join(root, "members.json");
    const lockPath = fileProcessMutationLockPath(resourcePath);
    try {
      await writeLock(lockPath, {
        token: "live-owner",
        pid: process.pid,
        acquiredAt: "2026-07-14T00:00:00.000Z"
      });

      await expect(
        withFileProcessMutationLock(
          resourcePath,
          async () => "unexpected",
          { timeoutMs: 100, staleMs: 50, retryMs: 5 }
        )
      ).rejects.toThrow("file process mutation lock timed out");
      expect(JSON.parse(await readFile(path.join(lockPath, "owner.json"), "utf8")))
        .toMatchObject({ token: "live-owner", pid: process.pid });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createRoot(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(tmpdir(), "layo-file-lock-"));
}

async function writeLock(
  lockPath: string,
  owner: { token: string; pid: number; acquiredAt: string }
): Promise<void> {
  await mkdir(lockPath, { recursive: true });
  await writeFile(
    path.join(lockPath, "owner.json"),
    JSON.stringify({
      schemaVersion: 1,
      token: owner.token,
      pid: owner.pid,
      hostname: hostname(),
      acquiredAt: owner.acquiredAt
    }),
    "utf8"
  );
}
