# Penpot Storage Restore Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scheduled, repository-owned restore drill that proves `.layo` storage backups can be restored and read without waiting for a human-operated incident.

**Architecture:** Reuse the existing storage backup archive helper and add a restore-drill helper that creates an in-memory backup, restores it into a temporary work directory, and validates expected project/file evidence through `FileStorage`. Expose it through `pnpm run storage:backup -- drill`, then add a GitHub Actions workflow that seeds a temporary storage root and runs the drill on a schedule and on manual dispatch.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, GitHub Actions, existing `FileStorage`, existing `storage:backup` CLI.

## Global Constraints

- Browser/UI debugging must use Playwright CLI.
- Work in an isolated worktree.
- Use TDD: write RED tests before production code.
- Do not use GitHub Pages as a deployment target.
- Do not require hosted secrets for this drill; hosted database/object-store backup automation remains a later gap.
- Reference capability: Penpot self-host configuration supports filesystem or S3 object storage through environment variables, so Layo should move from manual filesystem-only runbooks toward repeatable hosted operations.

---

### Task 1: Restore Drill Helper

**Files:**
- Modify: `apps/server/src/storage-backup.ts`
- Modify: `apps/server/src/storage-backup.test.ts`

**Interfaces:**
- Consumes: `createStorageBackupArchive(rootDir)`, `restoreStorageBackupArchive(archive, targetRootDir)`, and `FileStorage`.
- Produces:
  - `StorageRestoreDrillOptions` with `{ workDir?: string; expectProjectId?: string; expectFileId?: string }`.
  - `StorageRestoreDrillResult` with `{ review, restoreRoot, checks }`.
  - `runStorageRestoreDrill(rootDir: string, options?: StorageRestoreDrillOptions): Promise<StorageRestoreDrillResult>`.

- [x] **Step 1: Write failing restore-drill test**

Add a test that creates a project and a saved version, runs `runStorageRestoreDrill(sourceRoot, { workDir, expectProjectId: "test-project", expectFileId: "sample-file" })`, and asserts the restored store reports one project, the expected project/file ids, and a nonzero version count.

- [x] **Step 2: Run RED storage test**

Run: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts`

Observed: FAIL because `runStorageRestoreDrill` was not a function.

- [x] **Step 3: Implement restore-drill helper**

Add the helper to `storage-backup.ts`. It should create an archive from `rootDir`, restore it into `<workDir>/restore` or a temporary directory, read the restored store through `FileStorage`, and throw if the expected project or file cannot be read.

- [x] **Step 4: Run GREEN storage test**

Run: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts`

Observed: PASS with 3 storage backup tests.

### Task 2: CLI And Workflow Guards

**Files:**
- Modify: `apps/server/src/storage-backup-cli.ts`
- Modify: `scripts/layo-storage-backup.mjs`
- Modify: `scripts/check-dev-scripts.test.mjs`
- Modify: `scripts/check-deployment-artifacts.test.mjs`
- Create: `.github/workflows/storage-restore-drill.yml`

**Interfaces:**
- Consumes: `runStorageRestoreDrill`.
- Produces command:
  - `pnpm run storage:backup -- drill --storage-dir <dir> --work-dir <dir> --expect-project <project-id> --expect-file <file-id>`

- [x] **Step 1: Write failing artifact tests**

Extend `scripts/check-dev-scripts.test.mjs` to assert the storage backup runner documents `drill`, `--work-dir`, `--expect-project`, and `--expect-file`.

Add a deployment artifact test that asserts `.github/workflows/storage-restore-drill.yml` exists, has `schedule` and `workflow_dispatch`, seeds a temporary storage root through `FileStorage`, calls `pnpm run storage:backup -- drill`, and does not mention Vercel secrets.

- [x] **Step 2: Run RED artifact tests**

Run:
- `node --test scripts/check-dev-scripts.test.mjs`
- `node --test scripts/check-deployment-artifacts.test.mjs`

Observed: FAIL because the CLI runner did not document `drill` and `.github/workflows/storage-restore-drill.yml` did not exist.

- [x] **Step 3: Implement CLI drill command**

Add `drill` to `StorageBackupCommand`, parse `--work-dir`, `--expect-project`, and `--expect-file`, call `runStorageRestoreDrill`, and print a JSON result with `command: "drill"`.

- [x] **Step 4: Add scheduled restore drill workflow**

Create `.github/workflows/storage-restore-drill.yml` with:
- weekly `schedule`
- `workflow_dispatch`
- PR trigger for backup/drill/workflow/docs changes
- pnpm setup
- dependency install
- temporary `FileStorage` seed with project id `ci-project`, document id `ci-file`, and a saved version
- `pnpm run storage:backup -- drill --storage-dir "$source_dir" --work-dir "$work_dir" --expect-project ci-project --expect-file ci-file`

- [x] **Step 5: Run GREEN artifact tests**

Run:
- `node --test scripts/check-dev-scripts.test.mjs`
- `node --test scripts/check-deployment-artifacts.test.mjs`

Observed: PASS for dev-script and deployment artifact tests.

### Task 3: Documentation, Benchmark, And Gates

**Files:**
- Modify: `docs/deployment/collaboration.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: `docs/superpowers/plans/2026-06-28-penpot-storage-restore-drill.md`

**Interfaces:**
- Consumes: CLI command and workflow from Task 2.
- Produces: documented automated restore drill and updated maturity gap status.

- [x] **Step 1: Document automated restore drill**

Add a section under storage backup docs showing the local drill command and noting that `.github/workflows/storage-restore-drill.yml` runs the same flow on a seeded store.

- [x] **Step 2: Update maturity benchmark**

Move scheduled restore drills from the remaining gap into current posture. Keep hosted database/object-store storage, retention policy, and hosted backup automation as remaining gaps.

- [x] **Step 3: Run final gates**

Run:
- `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts`
- `node --test scripts/check-dev-scripts.test.mjs`
- `node --test scripts/check-deployment-artifacts.test.mjs`
- CLI smoke for `storage:backup -- drill`
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

- RED storage test: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts` failed because `runStorageRestoreDrill` was not a function.
- GREEN storage test: `pnpm --filter @layo/server exec vitest run src/storage-backup.test.ts` passed with 3 tests after adding restore-drill support.
- RED dev-script artifact test: `node --test scripts/check-dev-scripts.test.mjs` failed because `scripts/layo-storage-backup.mjs` did not document `drill`.
- RED deployment artifact test: `node --test scripts/check-deployment-artifacts.test.mjs` failed because `.github/workflows/storage-restore-drill.yml` was missing.
- GREEN artifact tests: `node --test scripts/check-dev-scripts.test.mjs` and `node --test scripts/check-deployment-artifacts.test.mjs` passed after adding the CLI command and workflow.
- CLI smoke: seeded a temporary `FileStorage`, ran `pnpm run storage:backup -- drill --storage-dir "$source_dir" --work-dir "$work_dir" --expect-project ci-project --expect-file ci-file`, and verified JSON output with `expectedProjectFound: true`, `expectedFileFound: true`, and `expectedFileVersionCount: 1`.
- Final gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `cargo test -p editor-core`, `pnpm test`, `pnpm test:e2e` with 144 passing Playwright CLI tests, and `git diff --check` passed.
