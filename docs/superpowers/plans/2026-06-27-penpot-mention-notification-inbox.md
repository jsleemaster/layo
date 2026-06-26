# Penpot Mention Notification Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Penpot-inspired local mention notification inbox so Layo separates “unread comments” from “comments that mention me” in project/file notifications.

**Architecture:** Reuse the existing comment sidecar store and `/comments/notifications` endpoint. Extend notification summaries with mention counts and sort projects/files by latest unread comment activity so the inbox is stable and useful for team review.

**Tech Stack:** TypeScript, FileStorage, Fastify HTTP, MCP stdio tools, React, Playwright CLI, Vitest.

---

## Context

Layo already stores structured `mentionTargets` and unread state, but the file panel only shows generic unread comment counts. Penpot-class team products need a clear “mentions for me” notification surface, not only raw unread totals.

The current baseline also exposed a flaky notification ordering failure: project notification order depends on `ProjectManifest.updatedAt`, while users expect the newest unread comment activity first.

## Tasks

### Task 1: Storage Notification Model

**Files:**
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/storage.test.ts`

- [x] **Step 1: Write failing sort test**

`comment notifications order projects by latest unread comment activity` creates an older project that is updated later, then creates a newer unread comment in another project. Expected project order is newest unread comment first.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "comment notifications order projects by latest unread comment activity"
```

Expected: FAIL with `expected [ 'project-old', 'project-new' ] to deeply equal [ 'project-new', 'project-old' ]`.

- [x] **Step 3: Add mention counts and activity ordering**

Extend `CommentNotificationFileSummary`, `CommentNotificationProjectSummary`, and `CommentNotificationSummary` with `mentionCount` and internal `latestUnreadAt` ordering. Count only unresolved unread threads whose `mentionTargets` match the viewer by `userId` or `displayName`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "comment notifications"
```

Expected: PASS.

### Task 2: API Surface

**Files:**
- Modify: `apps/server/src/http.test.ts`
- Modify: `apps/server/src/mcp.test.ts`
- Modify: `apps/web/src/document-api.ts`
- Modify: `apps/web/src/document-api.test.ts`

- [x] **Step 1: Write failing contract expectations**

Extend HTTP, MCP, and web API notification tests to expect `totalMentions`, project `mentionCount`, and file `mentionCount`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts src/mcp.test.ts -t "comment"
pnpm --filter @layo/web test -- src/document-api.test.ts -t "comment"
```

Expected: FAIL until the extended summary model is implemented.

- [x] **Step 3: Implement typed API model updates**

Keep the existing endpoint and MCP tool names. Return the extended summary shape through storage, HTTP, MCP, and web API helpers.

- [x] **Step 4: Verify GREEN**

Run the same focused commands and expect PASS.

### Task 3: File Panel Mention Inbox

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write failing Playwright CLI coverage**

Add a file panel e2e test that creates a comment with `mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]`, opens the file panel, and expects both `읽지 않은 코멘트 1개` and `나를 멘션 1개`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "file panel shows mention-targeted comment notifications" --workers=1 --reporter=line
```

Expected: FAIL until the UI renders mention counts.

- [x] **Step 3: Implement UI**

Add a second pill beside unread counts and include per-file `멘션 N개` text when `mentionCount > 0`. Keep the existing current-file read button behavior.

- [x] **Step 4: Verify GREEN**

Run the same Playwright CLI command and expect PASS.

### Task 4: Maturity Docs And Full Verification

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/team-collaboration-roadmap.md`
- Modify: `docs/product/figma-feature-inventory.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Record maturity delta**

Document that Layo now has local targeted mention notification summaries, while live delivery and external notification channels remain open gaps.

- [x] **Step 2: Run verification**

Run:

```bash
git diff --check
pnpm run check:design-rules
pnpm run check:penpot-maturity
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 3: Publish**

Commit, push, create PR through GitHub REST API, merge after checks/review, then run the post-merge cleanup process.
