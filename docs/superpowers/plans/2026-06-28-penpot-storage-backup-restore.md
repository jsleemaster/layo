# Penpot Storage Backup Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-owned `.layo` storage backup, review, and restore path so Layo can prove project/file/assets/comments/history/library data can be moved to a fresh store.

**Architecture:** Reuse the server ZIP primitive in `apps/server/src/file-archive.ts` and add a focused `storage-backup.ts` helper that recursively archives only files under the selected storage root. A Node CLI script runs through `tsx` so operators and CI can create a backup, review it, and restore it without starting the HTTP server.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, existing uncompressed ZIP archive helper, `tsx`.

## Global Constraints

- Browser/UI debugging must use Playwright CLI.
- Work in an isolated worktree.
- Use TDD: write RED tests before production code.
- Do not use GitHub Pages as a deployment target.
- Do not store secrets in backup fixtures or docs.

---

### Task 1: Storage Backup Helper

**Files:**
- Create: `apps/server/src/storage-backup.ts`
- Test: `apps/server/src/storage-backup.test.ts`

**Interfaces:**
- Produces: `createStorageBackupArchive(rootDir: string): Promise<Buffer>`
- Produces: `reviewStorageBackupArchive(archive: Buffer): StorageBackupReview`
- Produces: `restoreStorageBackupArchive(archive: Buffer, targetRootDir: string, options?: { force?: boolean }): Promise<StorageBackupReview>`
- Produces: `StorageBackupReview` with `{ schemaVersion: 1, createdAt: string, fileCount: number, totalBytes: number, directories: string[], entries: string[] }`

- [x] **Step 1: Write failing backup/restore tests**

Add tests that create a project, image asset, file version, comment thread, and published library, then assert a backup archive can be reviewed and restored into a fresh `FileStorage` root with matching project/file/comment/history/library evidence.

- [x] **Step 2: Run RED test**

Run: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts`

Observed: FAIL because `./storage-backup` did not exist.

- [x] **Step 3: Implement storage backup helper**

Create a manifest entry at `manifest.json`, archive storage files under `storage/<relativePath>`, reject unsafe paths through the existing ZIP reader, refuse to restore over a non-empty target unless `force: true`, and write restored files only under the target root.

- [x] **Step 4: Run GREEN test**

Run: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts`

Observed: PASS after replacing the invalid PNG fixture with valid image bytes.

### Task 2: CLI And Artifact Guard

**Files:**
- Create: `scripts/layo-storage-backup.mjs`
- Modify: `scripts/check-dev-scripts.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: server helper through `tsx apps/server/src/storage-backup-cli.ts` or direct `tsx` execution.
- Produces commands:
  - `pnpm run storage:backup -- backup --storage-dir <dir> --out <archive>`
  - `pnpm run storage:backup -- review --archive <archive>`
  - `pnpm run storage:backup -- restore --archive <archive> --storage-dir <dir> --force`

- [x] **Step 1: Write failing artifact test**

Add a Node test that asserts `package.json` exposes `storage:backup`, the CLI script exists, and the script documents `backup`, `review`, and `restore`.

- [x] **Step 2: Run RED test**

Run: `node --test scripts/check-dev-scripts.test.mjs`

Observed: FAIL because the script and package script were missing.

- [x] **Step 3: Implement CLI**

Create a small argument parser in `scripts/layo-storage-backup.mjs` and invoke the TypeScript helper through `tsx`. The CLI must print JSON summaries for backup, review, and restore.

- [x] **Step 4: Run GREEN test**

Run: `node --test scripts/check-dev-scripts.test.mjs`

Observed: PASS.

### Task 3: Documentation And Benchmark

**Files:**
- Modify: `docs/deployment/collaboration.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: `docs/superpowers/plans/2026-06-28-penpot-storage-backup-restore.md`

**Interfaces:**
- Consumes: CLI commands from Task 2.
- Produces: documented backup/review/restore runbook and updated maturity gap status.

- [x] **Step 1: Document runbook**

Add deployment docs showing backup, review, restore to a fresh storage dir, and post-restore smoke checks.

- [x] **Step 2: Update maturity benchmark**

Move backup/restore runbooks from the active import/export and operations gaps into current posture, while keeping hosted database/object-store backup automation as a remaining gap.

- [x] **Step 3: Run final gates**

Run:
- `pnpm run check:penpot-maturity`
- `pnpm run check:design-rules`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `cargo test -p editor-core`
- `pnpm test`
- `pnpm test:e2e`
- `git diff --check`

Expected: all pass.

## Execution Evidence

- RED storage test: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts` failed before `apps/server/src/storage-backup.ts` existed.
- GREEN storage test: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts` passed with backup review, restore, force-restore guard, project/file/asset/history/comment/library evidence.
- RED artifact test: `node --test scripts/check-dev-scripts.test.mjs` failed before `scripts/layo-storage-backup.mjs` and `storage:backup` existed.
- GREEN artifact test: `node --test scripts/check-dev-scripts.test.mjs` passed after adding the runner and package script.
- CLI smoke: created a temporary storage root with a project and saved file version, ran backup, review, restore, then read the restored project and version count through `FileStorage`.
- Typecheck failure loop: first broad `pnpm typecheck` failed because the storage backup fixture passed unsupported `width`/`height` fields to `CreateAssetInput`, and manifest number fields were not narrowed after JSON parsing. The fixture now matches existing `createAsset` usage, and the manifest guard explicitly narrows `fileCount` and `totalBytes`.
- Final gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `cargo test -p editor-core`, `pnpm test`, `pnpm test:e2e` with 144 passing Playwright CLI tests, and `git diff --check` passed.
