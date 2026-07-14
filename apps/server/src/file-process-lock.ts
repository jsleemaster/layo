import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const mutationTails = new Map<string, Promise<void>>();
const DEFAULT_RETRY_MS = 25;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_MS = 5_000;

interface FileProcessLockOwner {
  schemaVersion: 1;
  token: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
}

export interface FileProcessMutationLockOptions {
  retryMs?: number;
  timeoutMs?: number;
  staleMs?: number;
}

export async function withFileProcessMutationLock<T>(
  resourcePath: string,
  operation: () => Promise<T>,
  options: FileProcessMutationLockOptions = {}
): Promise<T> {
  const normalizedPath = path.resolve(resourcePath);
  const previous = mutationTails.get(normalizedPath) ?? Promise.resolve();
  let releaseInProcess!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseInProcess = resolve;
  });
  mutationTails.set(normalizedPath, current);
  await previous;

  let releaseProcess: (() => Promise<void>) | undefined;
  try {
    releaseProcess = await acquireFileProcessMutationLock(normalizedPath, options);
    return await operation();
  } finally {
    try {
      await releaseProcess?.();
    } finally {
      releaseInProcess();
      if (mutationTails.get(normalizedPath) === current) {
        mutationTails.delete(normalizedPath);
      }
    }
  }
}

export function fileProcessMutationLockPath(resourcePath: string): string {
  const normalizedPath = path.resolve(resourcePath);
  const hash = createHash("sha256").update(normalizedPath).digest("hex");
  return path.join(path.dirname(normalizedPath), ".layo-locks", `mutation-${hash}.lock`);
}

async function acquireFileProcessMutationLock(
  resourcePath: string,
  options: FileProcessMutationLockOptions
): Promise<() => Promise<void>> {
  const lockDir = fileProcessMutationLockPath(resourcePath);
  const locksDir = path.dirname(lockDir);
  const owner: FileProcessLockOwner = {
    schemaVersion: 1,
    token: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    acquiredAt: new Date().toISOString()
  };
  // Bounded waits avoid hanging self-hosted auth writes; stale recovery remains same-host only.
  const retryMs = normalizeDuration(options.retryMs, DEFAULT_RETRY_MS, 5);
  const timeoutMs = normalizeDuration(
    options.timeoutMs ?? Number(process.env.LAYO_AUTHORIZATION_LOCK_TIMEOUT_MS),
    DEFAULT_TIMEOUT_MS,
    100
  );
  const staleMs = normalizeDuration(
    options.staleMs ?? Number(process.env.LAYO_AUTHORIZATION_LOCK_STALE_MS),
    DEFAULT_STALE_MS,
    50
  );
  const startedAt = Date.now();

  await mkdir(locksDir, { recursive: true });
  while (true) {
    const candidateDir = `${lockDir}.candidate-${owner.token}`;
    await mkdir(candidateDir);
    try {
      await writeFile(
        path.join(candidateDir, "owner.json"),
        `${JSON.stringify(owner, null, 2)}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 }
      );
      await syncDirectory(candidateDir);
      await rename(candidateDir, lockDir);
      await syncDirectory(locksDir);
      return async () => releaseFileProcessMutationLock(lockDir, locksDir, owner);
    } catch (error) {
      await rm(candidateDir, { recursive: true, force: true });
      if (!isContention(error)) {
        throw error;
      }
    }

    if (await recoverAbandonedFileProcessMutationLock(lockDir, locksDir, staleMs)) {
      continue;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`file process mutation lock timed out: ${lockDir}`);
    }
    await delay(retryMs);
  }
}

async function releaseFileProcessMutationLock(
  lockDir: string,
  locksDir: string,
  owner: FileProcessLockOwner
): Promise<void> {
  const current = parseOwner(
    JSON.parse(await readFile(path.join(lockDir, "owner.json"), "utf8"))
  );
  if (current.token !== owner.token) {
    throw new Error("file process mutation lock ownership changed before release");
  }
  const releasingDir = `${lockDir}.releasing-${owner.token}`;
  await rename(lockDir, releasingDir);
  await rm(releasingDir, { recursive: true, force: true });
  await syncDirectory(locksDir);
}

async function recoverAbandonedFileProcessMutationLock(
  lockDir: string,
  locksDir: string,
  staleMs: number
): Promise<boolean> {
  const ownerPath = path.join(lockDir, "owner.json");
  let owner: FileProcessLockOwner;
  try {
    owner = parseOwner(JSON.parse(await readFile(ownerPath, "utf8")));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return true;
    }
    throw error;
  }
  if (
    Date.now() - Date.parse(owner.acquiredAt) < staleMs
    || owner.hostname !== hostname()
    || isProcessAlive(owner.pid)
  ) {
    return false;
  }

  const claimPath = `${lockDir}.recovery-${owner.token}.claim`;
  try {
    await link(ownerPath, claimPath);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EEXIST") {
      return false;
    }
    if (code === "ENOENT") {
      return true;
    }
    throw error;
  }

  try {
    const claimed = parseOwner(JSON.parse(await readFile(claimPath, "utf8")));
    if (claimed.token !== owner.token) {
      return false;
    }
    const abandonedDir = `${lockDir}.abandoned-${owner.token}-${randomUUID()}`;
    try {
      await rename(lockDir, abandonedDir);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return true;
      }
      throw error;
    }
    try {
      const moved = parseOwner(
        JSON.parse(await readFile(path.join(abandonedDir, "owner.json"), "utf8"))
      );
      if (moved.token !== owner.token) {
        throw new Error("file process mutation lock changed during stale recovery");
      }
      await rm(abandonedDir, { recursive: true, force: true });
      await syncDirectory(locksDir);
      return true;
    } catch (error) {
      await rename(abandonedDir, lockDir).catch(() => undefined);
      throw error;
    }
  } finally {
    await rm(claimPath, { force: true });
    await syncDirectory(locksDir);
  }
}

function parseOwner(value: unknown): FileProcessLockOwner {
  if (!value || typeof value !== "object") {
    throw new Error("invalid file process mutation lock owner");
  }
  const candidate = value as Partial<FileProcessLockOwner>;
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.token !== "string"
    || !candidate.token
    || typeof candidate.pid !== "number"
    || !Number.isInteger(candidate.pid)
    || candidate.pid <= 0
    || typeof candidate.hostname !== "string"
    || !candidate.hostname
    || typeof candidate.acquiredAt !== "string"
    || !Number.isFinite(Date.parse(candidate.acquiredAt))
  ) {
    throw new Error("invalid file process mutation lock owner");
  }
  return {
    schemaVersion: 1,
    token: candidate.token,
    pid: candidate.pid,
    hostname: candidate.hostname,
    acquiredAt: new Date(candidate.acquiredAt).toISOString()
  };
}

function isContention(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === "EEXIST" || code === "ENOTEMPTY";
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

function normalizeDuration(
  value: number | undefined,
  fallback: number,
  minimum: number
): number {
  return Number.isFinite(value) && value! >= minimum ? Math.floor(value!) : fallback;
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await open(directoryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
