# Penpot-Style Automatic File History Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change. Verify RED before production edits, then verify GREEN and run broad checks before PR.

**Goal:** Add Penpot-inspired automatic file versions so saved edits create recoverable local history without requiring a manual "current version save" every time.

**Reference:** Penpot's History panel distinguishes manual and automatic versions and self-hosted Penpot exposes an automatic snapshot frequency setting. Layo should use the same product direction while keeping the local-first `.layo` storage model.

---

## Failure Case

Layo currently only stores file versions when a user manually saves a version or when a restore creates a recovery snapshot. After repeated persisted edits through the normal agent/server path, `/files/:fileId/versions` remains empty and the file panel cannot show an `자동 저장` history row.

## Acceptance Criteria

- [x] A persisted edit increments per-file automatic history state without creating a snapshot before the threshold.
- [x] The third persisted edit creates an immutable file version with `source: "auto"` and message `자동 저장`.
- [x] Automatic version state is stored outside `.layo/history/<fileId>/` so version listing only parses real snapshots.
- [x] Dry-runs, manual saves, and restore recovery snapshots do not increment or create automatic versions.
- [x] HTTP and MCP list surfaces expose `source: "auto"` without adding new APIs.
- [x] The file panel renders automatic versions as `자동 저장`.
- [x] Focused server/web tests, Playwright CLI e2e, typecheck, build, full tests, and maturity check pass before PR.

## Tasks

### Task 1: RED Tests

- [x] Add storage coverage for thresholded automatic snapshots.
- [x] Add HTTP agent-command coverage for automatic versions in the version list/read routes.
- [x] Add MCP coverage for automatic versions through existing command/list tools.
- [x] Add Playwright CLI coverage for the file panel `자동 저장` label.
- [x] Run focused tests and verify expected failures before implementation.

### Task 2: Implement Automatic History

- [x] Add `auto` to file version source contracts.
- [x] Add per-file automatic history state under `.layo/history-state`.
- [x] Record persisted edit counts and create an automatic version every three persisted edits.
- [x] Ensure manual save, restore, read/list, and dry-run paths do not create automatic versions.
- [x] Update web API types and file panel labels.

### Task 3: Verify And Ship

- [x] Run focused RED/GREEN tests.
- [x] Run Playwright CLI proof for automatic history UI.
- [x] Run broad repo verification.
- [ ] Commit, push, create PR, merge, and perform post-merge cleanup.

## Verification Evidence

- RED: `pnpm --filter @layo/server test -- src/storage.test.ts -t "automatic file version"` failed because automatic versions stayed at `0`.
- RED: `pnpm --filter @layo/server test -- src/http.test.ts -t "automatic file versions"` failed because no `source: "auto"` version was listed.
- RED: `pnpm --filter @layo/server test -- src/mcp.test.ts -t "automatic file versions"` failed because no `source: "auto"` version was listed.
- RED: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "automatic saved versions" --workers=1 --reporter=line` failed because the file panel still showed `저장된 버전 없음`.
- GREEN focused: `pnpm --filter @layo/server test -- src/storage.test.ts -t "automatic file version"`.
- GREEN focused: `pnpm --filter @layo/server test -- src/http.test.ts -t "automatic file versions"`.
- GREEN focused: `pnpm --filter @layo/server test -- src/mcp.test.ts -t "automatic file versions"`.
- GREEN focused: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "automatic saved versions" --workers=1 --reporter=line`.
- Broad: `pnpm typecheck`.
- Broad: `pnpm run check:penpot-maturity`.
- Broad: `pnpm --filter @layo/web build`.
- Broad: `git diff --check`.
- Broad: `pnpm test`.
- Broad: `pnpm test:e2e`.
