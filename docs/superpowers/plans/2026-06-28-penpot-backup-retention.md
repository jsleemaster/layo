# Penpot Backup Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-owned backup archive repository and retention policy so `.layo` backups can be listed, dry-run pruned, and automatically pruned without deleting the newest recovery points.

**Architecture:** Extend the existing `.layo` storage backup module instead of adding a new subsystem. A local filesystem archive repository stores reviewed backup zip files with manifest-derived metadata, lists them newest-first, and prunes them with `keepLast`, `maxAgeDays`, and `dryRun` controls. CI seeds multiple backups and proves retention leaves the expected number of archives.

**Tech Stack:** TypeScript, Vitest, Node CLI, GitHub Actions, existing Layo zip archive utilities.

## Global Constraints

- Follow TDD: write failing tests before production code.
- Keep the implementation scoped to the existing `storage:backup` operator workflow.
- Do not claim hosted object-store maturity; this slice creates a local adapter and retention contract while leaving hosted object-store storage as a remaining gap.

---

### Task 1: Backup Repository API

**Files:**
- Modify: `apps/server/src/storage-backup.ts`
- Test: `apps/server/src/storage-backup.test.ts`

**Interfaces:**
- Produces: `writeStorageBackupToRepository(rootDir, repositoryDir, options?)`
- Produces: `listStorageBackupRepository(repositoryDir)`
- Produces: `pruneStorageBackupRepository(repositoryDir, options)`

- [x] **Step 1: Write failing tests**
- [x] **Step 2: Run tests and confirm missing export failures**
- [x] **Step 3: Implement repository write/list/prune**
- [x] **Step 4: Run tests and confirm pass**

### Task 2: CLI And Scheduled Retention Workflow

**Files:**
- Modify: `apps/server/src/storage-backup-cli.ts`
- Modify: `scripts/layo-storage-backup.mjs`
- Modify: `scripts/check-dev-scripts.test.mjs`
- Modify: `scripts/check-deployment-artifacts.test.mjs`
- Create: `.github/workflows/storage-backup-retention.yml`

**Interfaces:**
- Produces: `pnpm run storage:backup -- repository-put --storage-dir <dir> --repository-dir <dir>`
- Produces: `pnpm run storage:backup -- repository-list --repository-dir <dir>`
- Produces: `pnpm run storage:backup -- repository-prune --repository-dir <dir> --keep-last <n> [--max-age-days <n>] [--dry-run]`

- [x] **Step 1: Write failing artifact tests**
- [x] **Step 2: Run tests and confirm workflow/CLI contract failures**
- [x] **Step 3: Implement CLI commands and workflow**
- [x] **Step 4: Run artifact and CLI smoke tests**

### Task 3: Product Documentation And Gates

**Files:**
- Modify: `docs/deployment/collaboration.md`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

**Interfaces:**
- Produces: updated maturity evidence that distinguishes local repository retention from hosted object-store maturity.

- [x] **Step 1: Update docs after code passes**
- [x] **Step 2: Run maturity/design/type/build/test/e2e gates**
- [x] **Step 3: Record verification evidence before PR**

## RED Evidence

```bash
pnpm --filter @layo/server test -- src/storage-backup.test.ts
node --test scripts/check-deployment-artifacts.test.mjs
node --test scripts/check-dev-scripts.test.mjs
```

The storage test failed with `writeStorageBackupToRepository is not a function`, the deployment artifact test failed because `.github/workflows/storage-backup-retention.yml` did not exist, and the dev-script test failed because the backup wrapper did not mention the repository commands.

The first CLI smoke also exposed a real wrapper failure: without `NODE_OPTIONS=--conditions=development`, a fresh worktree could not resolve source exports and tried to load `@layo/collaboration/dist/index.js`. A follow-up RED assertion required the wrapper to set `NODE_OPTIONS` with `--conditions=development`, then the wrapper was fixed.

## GREEN Evidence

```bash
pnpm --filter @layo/server test -- src/storage-backup.test.ts
node --test scripts/check-deployment-artifacts.test.mjs
node --test scripts/check-dev-scripts.test.mjs
pnpm run storage:backup -- repository-put --storage-dir <tmp-source> --repository-dir <tmp-backups> --backup-id cli-old
pnpm run storage:backup -- repository-put --storage-dir <tmp-source> --repository-dir <tmp-backups> --backup-id cli-new
pnpm run storage:backup -- repository-list --repository-dir <tmp-backups>
pnpm run storage:backup -- repository-prune --repository-dir <tmp-backups> --keep-last 1 --dry-run
pnpm run storage:backup -- repository-prune --repository-dir <tmp-backups> --keep-last 1
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm --filter @layo/web build
cargo test -p editor-core
pnpm test
pnpm test:e2e
```

Focused storage, artifact, and dev-script tests passed. The CLI smoke created two repository archives, listed them newest-first, dry-ran keep-last retention, applied retention, and verified one zip remained. Repository maturity, design, typecheck, web build, Rust core, full `pnpm test`, and Playwright CLI e2e with 144 tests passed.

## Remaining Gaps

This slice adds local filesystem archive repository retention and scheduled CI proof. It deliberately does not claim hosted database/object-store storage. Remaining operations gaps are durable hosted database/object-store backups, production Vercel secrets/deploy proof, hosted multi-instance registry sync, hosted durable pub/sub, and Penpot/Figma migration paths.
