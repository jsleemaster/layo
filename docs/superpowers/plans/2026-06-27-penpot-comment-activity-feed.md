# Penpot Comment Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Penpot-inspired retained comment activity feed so Layo users can see recent comment create, reply, and resolve activity across project files.

**Architecture:** Extend the existing `.layo/comments/<fileId>.json` sidecar from thread-only storage to a thread plus activity store. Storage records deterministic activity events whenever comment threads are created, replied to, or resolved; HTTP, MCP, and web helpers expose recent project/file activity; the file panel renders the current project's recent comment activity below unread summaries.

**Tech Stack:** TypeScript, Fastify, MCP SDK, React, Vitest, Playwright CLI.

## Global Constraints

- Keep comment data local/team-owned and outside `DesignFile`.
- Use TDD: add failing tests before production code.
- Use Playwright CLI for browser debugging and e2e verification.
- Keep the overall Penpot maturity goal active; this slice is progress, not final completion.

---

## Product Contract

- Penpot reference: workspace notifications surface unread comments in team files, and the History panel includes an Actions feed for file activity.
- Layo adaptation: comment activity is retained locally in comment sidecars with a bounded recent list.
- Layo adaptation: `listCommentActivity({ viewerId, limit })` returns recent project/file events for comment creation, replies, and resolution.
- The file panel shows the current project's recent comment activity alongside unread comment summary.
- Live cross-browser comment sync, real team-member mention targeting, and full review workflows remain later maturity gaps.

## File Map

- Modify: `apps/server/src/storage.ts`
  - Add `StoredCommentActivityEvent`, activity parsing, bounded retention, `listCommentActivity`, and event recording from create/reply/resolve.
- Modify: `apps/server/src/storage.test.ts`
  - Add RED/GREEN coverage for retained project/file comment activity order, limit, and event metadata.
- Modify: `apps/server/src/http.ts`
  - Add `GET /comments/activity`.
- Modify: `apps/server/src/http.test.ts`
  - Add HTTP coverage for project/file activity response after create/reply/resolve.
- Modify: `apps/server/src/mcp.ts`
  - Add `list_comment_activity`.
- Modify: `apps/server/src/mcp.test.ts`
  - Extend comment workflow MCP coverage with activity listing.
- Modify: `apps/web/src/document-api.ts`
  - Add comment activity types and `listCommentActivity`.
- Modify: `apps/web/src/document-api.test.ts`
  - Add web helper RED/GREEN coverage.
- Modify: `apps/web/src/App.tsx`
  - Load activity with projects/comments, refresh after comment mutations, and show activity rows in the file panel.
- Modify: `apps/web/src/styles.css`
  - Add tokenized activity feed styles.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI regression for recent comment activity in the file panel.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move local comment activity feed from gap to landed foundation.
- Modify: `docs/product/team-collaboration-roadmap.md`
  - Record local retained comment activity feed foundation.
- Modify: `docs/product/figma-feature-inventory.md`
  - Update comment/history collaboration capability inventory.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record verification evidence after green.

## Tasks

### Task 1: Storage Activity Retention

- [x] Add failing storage test `comment activity feed retains project file events in recent order`.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts -t "comment activity feed retains"` and confirm it fails because `listCommentActivity` is missing.
- [x] Add activity types to `storage.ts`, parse legacy sidecars with `activity: []`, record `created`, `replied`, and `resolved` events, and bound retained events to the latest 50.
- [x] Re-run the focused storage test and confirm it passes.

### Task 2: HTTP And MCP Activity Surfaces

- [x] Add failing HTTP test for `GET /comments/activity?viewerId=...&limit=...`.
- [x] Add failing MCP coverage for `list_comment_activity`.
- [x] Implement HTTP and MCP read-only surfaces using `storage.listCommentActivity`.
- [x] Re-run focused HTTP and MCP tests and confirm they pass.

### Task 3: Web API And File Panel Activity UI

- [x] Add failing web API helper test for `listCommentActivity`.
- [x] Add failing Playwright CLI test that creates and resolves a comment, opens the file panel, and sees recent activity rows.
- [x] Implement web helper, App activity state refresh, file-panel UI, and tokenized styles.
- [x] Re-run focused web API and Playwright CLI tests and confirm they pass.

### Task 4: Docs, Full Verification, And Publish

- [x] Update Penpot maturity and collaboration docs to reflect local comment activity feed retention.
- [x] Run `git diff --check`.
- [x] Run `pnpm run check:design-rules`.
- [x] Run `pnpm run check:penpot-maturity`.
- [x] Run `pnpm --filter @layo/web build`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Start `pnpm dev`, verify `4317` and `5173`, then run `pnpm test:e2e`.
- [x] Commit, push, create PR, merge, sync `main`, remove worktree, delete local/remote branch, prune worktrees, stop dev servers, and verify ports `5173` and `4317` are clear.
