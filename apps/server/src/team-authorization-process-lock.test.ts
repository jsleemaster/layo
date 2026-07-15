import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

describe("team authorization cross-process mutations", () => {
  test("preserves every token created by concurrently released server processes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-process-"));
    const configPath = path.join(root, "members.json");
    const releasePath = path.join(root, "release");
    const workerPath = fileURLToPath(
      new URL("./team-authorization-process-worker.ts", import.meta.url)
    );
    const children: ChildProcessWithoutNullStreams[] = [];

    try {
      await writeFile(
        configPath,
        JSON.stringify(
          [{
            userId: "owner-user",
            role: "owner",
            teamIds: ["team-alpha"],
            token: "legacy-owner-token"
          }],
          null,
          2
        ),
        "utf8"
      );

      const ready = Array.from({ length: 6 }, (_, index) => {
        const tokenId = `process-token-${index}`;
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            workerPath,
            "create",
            configPath,
            tokenId,
            `layo_pat_process_${index}`,
            releasePath
          ],
          { stdio: ["pipe", "pipe", "pipe"], env: process.env }
        );
        children.push(child);
        return waitForMarker(child, "ready");
      });

      await Promise.all(ready);
      const exits = children.map(waitForSuccessfulExit);
      await writeFile(releasePath, "release\n", "utf8");
      await Promise.all(exits);

      const baseMembers = JSON.parse(await readFile(configPath, "utf8")) as Array<{
        tokens?: Array<{ id: string }>;
      }>;
      expect(baseMembers[0]?.tokens).toBeUndefined();
      const sidecar = JSON.parse(
        await readFile(`${configPath}.tokens.json`, "utf8")
      ) as {
        members: Array<{ tokens: Array<{ id: string }> }>;
      };
      expect(sidecar.members[0]?.tokens.map((token) => token.id).sort()).toEqual(
        Array.from({ length: 6 }, (_, index) => `process-token-${index}`)
      );
      expect(JSON.stringify(sidecar)).not.toContain("layo_pat_process_");
      expect(JSON.stringify(sidecar)).not.toMatch(/"token"\\s*:/);
    } finally {
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  test("preserves concurrent create and revoke effects from separate processes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "layo-token-process-mixed-"));
    const configPath = path.join(root, "members.json");
    const releasePath = path.join(root, "release");
    const workerPath = fileURLToPath(
      new URL("./team-authorization-process-worker.ts", import.meta.url)
    );
    const children: ChildProcessWithoutNullStreams[] = [];

    try {
      await writeFile(
        configPath,
        JSON.stringify(
          [{
            userId: "owner-user",
            role: "owner",
            teamIds: ["team-alpha"],
            token: "legacy-owner-token",
            tokens: [{
              id: "existing-token",
              name: "Existing token",
              tokenHash: createHash("sha256").update("existing-secret").digest("hex"),
              createdAt: "2026-07-13T12:00:00.000Z"
            }]
          }],
          null,
          2
        ),
        "utf8"
      );

      const createWorker = spawn(
        process.execPath,
        [
          "--import", "tsx", workerPath, "create", configPath,
          "new-token", "layo_pat_new", releasePath
        ],
        { stdio: ["pipe", "pipe", "pipe"], env: process.env }
      );
      const revokeWorker = spawn(
        process.execPath,
        [
          "--import", "tsx", workerPath, "revoke", configPath,
          "existing-token", "-", releasePath
        ],
        { stdio: ["pipe", "pipe", "pipe"], env: process.env }
      );
      children.push(createWorker, revokeWorker);
      await Promise.all([
        waitForMarker(createWorker, "ready"),
        waitForMarker(revokeWorker, "ready")
      ]);
      const exits = children.map(waitForSuccessfulExit);
      await writeFile(releasePath, "release\n", "utf8");
      await Promise.all(exits);

      const baseMembers = JSON.parse(await readFile(configPath, "utf8")) as Array<{
        tokens?: Array<{ id: string; revokedAt?: string }>;
      }>;
      expect(baseMembers[0]?.tokens).toEqual([
        expect.objectContaining({ id: "existing-token" })
      ]);
      expect(baseMembers[0]?.tokens?.[0]).not.toHaveProperty("revokedAt");
      const sidecar = JSON.parse(
        await readFile(`${configPath}.tokens.json`, "utf8")
      ) as {
        members: Array<{
          tokens: Array<{ id: string }>;
          revocations: Array<{ tokenId: string; revokedAt: string }>;
        }>;
      };
      expect(sidecar.members[0]?.tokens).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "new-token" })])
      );
      expect(sidecar.members[0]?.revocations).toEqual([
        {
          tokenId: "existing-token",
          revokedAt: "2026-07-14T12:00:00.000Z"
        }
      ]);
      expect(JSON.stringify(sidecar)).not.toContain("layo_pat_new");
      expect(JSON.stringify(sidecar)).not.toMatch(/"token"\\s*:/);
    } finally {
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});

function waitForMarker(
  child: ChildProcessWithoutNullStreams,
  marker: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes(marker)) {
        cleanup();
        resolve();
      }
    };
    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString();
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`token worker exited ${code} before ${marker}: ${stderr}`));
    };
    const cleanup = () => {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("exit", onExit);
  });
}

function waitForSuccessfulExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`token worker exited ${code}: ${stderr}`));
      }
    });
  });
}
