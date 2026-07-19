import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const fileWatchers = vi.hoisted(() => ({
  watchFile: vi.fn(),
  unwatchFile: vi.fn()
}));

vi.mock("node:fs", async () => ({
  ...(await vi.importActual<typeof import("node:fs")>("node:fs")),
  watchFile: fileWatchers.watchFile,
  unwatchFile: fileWatchers.unwatchFile
}));

import {
  authenticateTeamMember,
  watchTeamAuthorizationConfigFile
} from "./team-authorization";

describe("team authorization watcher registration", () => {
  let root: string | undefined;

  afterEach(async () => {
    fileWatchers.watchFile.mockClear();
    fileWatchers.unwatchFile.mockClear();
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  test("reconciles a sidecar created before the file watcher observes its first change", async () => {
    root = await mkdtemp(path.join(tmpdir(), "layo-token-watch-registration-"));
    const basePath = path.join(root, "members.json");
    await writeFile(basePath, baseMembers(), "utf8");
    let quarantineStarted = false;
    let releaseQuarantine = () => {};
    const quarantineRelease = new Promise<void>((resolve) => {
      releaseQuarantine = resolve;
    });
    const source = await watchTeamAuthorizationConfigFile(basePath, {
      pollIntervalMs: 10,
      beforeManagedTokenQuarantine: async () => {
        quarantineStarted = true;
        await quarantineRelease;
      }
    });

    try {
      await writeFile(`${basePath}.tokens.json`, conflictingSidecar(), "utf8");
      await waitFor(() => quarantineStarted);
      expect(authenticationFails(source.config)).toBe(true);

      await rm(`${basePath}.tokens.json`, { force: true });
      releaseQuarantine();
      await waitFor(() => !authenticationFails(source.config));
      expect(fileWatchers.watchFile).toHaveBeenCalledTimes(2);
    } finally {
      releaseQuarantine();
      source.close();
      await source.settled();
    }
  });

  test("does not strictly reload an unchanged recoverable startup sidecar", async () => {
    root = await mkdtemp(path.join(tmpdir(), "layo-token-watch-startup-"));
    const basePath = path.join(root, "members.json");
    await writeFile(basePath, baseMembers(), "utf8");
    await writeFile(`${basePath}.tokens.json`, recoverableSidecar(), "utf8");
    let quarantineAttempts = 0;
    const source = await watchTeamAuthorizationConfigFile(basePath, {
      pollIntervalMs: 10,
      beforeManagedTokenQuarantine: async () => {
        quarantineAttempts += 1;
      }
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await source.settled();
      expect(quarantineAttempts).toBe(0);
      expect(authenticationFails(source.config)).toBe(false);
    } finally {
      source.close();
      await source.settled();
    }
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for authorization state");
}

function authenticationFails(config: Parameters<typeof authenticateTeamMember>[0]): boolean {
  try {
    authenticateTeamMember(config, "owner-user", "legacy-owner-token");
    return false;
  } catch {
    return true;
  }
}

function baseMembers(): string {
  return JSON.stringify([{
    userId: "owner-user",
    role: "owner",
    teamIds: ["team-alpha"],
    token: "legacy-owner-token",
    tokens: [{
      id: "base-token",
      name: "Base token",
      tokenHash: hash("base-secret")
    }]
  }]);
}

function conflictingSidecar(): string {
  return JSON.stringify({
    version: 1,
    members: [{
      userId: "owner-user",
      tokens: [{
        id: "base-token",
        name: "Conflict",
        tokenHash: hash("conflict-secret")
      }],
      revocations: []
    }]
  });
}

function recoverableSidecar(): string {
  return JSON.stringify({
    version: 1,
    members: [{
      userId: "owner-user",
      tokens: [{
        id: "managed-token",
        name: "Managed token",
        tokenHash: hash("managed-secret")
      }],
      revocations: []
    }]
  });
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
