# Penpot Live Comment Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver local team comment notifications into an already-open Layo editor without requiring a reload or manual refresh.

**Architecture:** Keep the existing storage, HTTP, MCP, and web API shapes. Add a small browser-side live refresh loop that periodically re-reads comment threads, notification summaries, and recent activity for the current project file so comments created by another client or agent become visible in the file panel.

**Tech Stack:** React, TypeScript, existing comment HTTP APIs, Playwright CLI, Vitest.

---

## Context

The current Penpot maturity benchmark still lists live comment sync and delivered team notifications beyond local summaries as immature. Layo already has durable comment sidecars, unread summaries, mention counts, and retained activity, but the web app only refreshes those surfaces on load or after the current user performs a comment action. A teammate or agent can create a comment through HTTP/MCP while the editor is open, but the file panel does not receive that update until reload.

This slice closes the first delivery gap with a conservative polling loop. It does not claim full websocket/SSE collaboration; that remains a later live sync step.

## Tasks

### Task 1: Browser Delivery Regression

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write failing Playwright CLI coverage**

Add `file panel receives externally created comment notifications without reload`. The test creates a project, opens the file panel, asserts there are no current comment notifications, then uses `page.request.post` to create a comment with a viewer-targeted mention. Without reloading the page, it expects:

```ts
await expect(summary).toContainText("읽지 않은 코멘트 1개");
await expect(summary).toContainText("나를 멘션 1개");
await expect(summary).toContainText("멘션 1개");
await expect(feed).toContainText("디자인 팀");
await expect(feed).toContainText("@사용자 외부 알림 확인");
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "file panel receives externally created comment notifications without reload" --workers=1 --reporter=line
```

Expected: FAIL because the open editor never refreshes the file panel after the external API write.

### Task 2: Live Comment Refresh Loop

**Files:**
- Modify: `apps/web/src/App.tsx`

- [x] **Step 1: Add the minimal refresh loop**

Add `COMMENT_LIVE_REFRESH_INTERVAL_MS = 2_000` next to `LOCAL_COMMENT_VIEWER_ID`. Add a `useEffect` that runs only when `currentProject?.currentDocumentId` is present. Every interval tick should call:

```ts
void refreshCommentThreads(currentProject.currentDocumentId);
void refreshCommentNotifications();
void refreshCommentActivity();
```

The effect must clear the interval on project changes or unmount.

- [x] **Step 2: Verify GREEN**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "file panel receives externally created comment notifications without reload" --workers=1 --reporter=line
```

Expected: PASS.

### Task 3: Maturity Documentation And Full Verification

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/product/team-collaboration-roadmap.md`
- Modify: `docs/product/figma-feature-inventory.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Record maturity delta**

Document that Layo now has browser-delivered local comment notification/activity refresh for open editor sessions. Keep full live comment sync, websocket/SSE delivery, external channels, and review workflows as open gaps.

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

- [x] **Step 3: Publish**

Commit, push, create PR through GitHub REST API, merge after verification, and run the post-merge cleanup process.
