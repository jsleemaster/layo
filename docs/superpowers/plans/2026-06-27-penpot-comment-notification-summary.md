# Penpot Comment Notification Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Penpot-inspired unread comment notification summary across Layo projects and files, plus a local "mark all read" path.

**Architecture:** Build on the existing comment sidecar store. Storage computes unread counts per project document for a viewer; HTTP, MCP, and web helpers expose the summary; the file panel shows unread comment counts and a button to mark the current file read.

**Tech Stack:** TypeScript, Fastify, MCP SDK, React, Vitest, Playwright CLI.

---

## Product Contract

- Penpot reference: workspace comments can be marked read so they disappear from dashboard notifications, and the project dashboard shows unread comments inside team files.
- Layo adaptation: `listCommentNotifications(viewerId)` returns project/file unread counts from local `ProjectManifest` document membership and comment sidecars.
- Layo adaptation: `markFileCommentsRead(fileId, viewerId)` marks every active thread in one file as read for the viewer.
- The file panel surfaces the total unread comment count and per-file unread count for the opened project.
- The current document can be marked read from the file panel without selecting every commented object.

## File Map

- Modify: `apps/server/src/storage.ts`
  - Add comment notification summary types, storage aggregation, and file-level read operation.
- Modify: `apps/server/src/storage.test.ts`
  - Add storage RED/GREEN coverage for project/file unread summaries and mark-all-read.
- Modify: `apps/server/src/http.ts`
  - Add `GET /comments/notifications` and `POST /files/:fileId/comments/read`.
- Modify: `apps/server/src/http.test.ts`
  - Add HTTP RED/GREEN coverage for summary and mark-all-read routes.
- Modify: `apps/server/src/mcp.ts`
  - Add `list_comment_notifications` and `mark_file_comments_read`.
- Modify: `apps/server/src/mcp.test.ts`
  - Extend comment workflow MCP coverage.
- Modify: `apps/web/src/document-api.ts`
  - Add `CommentNotificationSummary`, `listCommentNotifications`, and `markFileCommentsRead`.
- Modify: `apps/web/src/document-api.test.ts`
  - Add helper RED/GREEN coverage.
- Modify: `apps/web/src/App.tsx`
  - Load notifications with projects/comments, show file-panel notification summary, and mark current file read.
- Modify: `apps/web/src/styles.css`
  - Add tokenized notification styles.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI regression for dashboard-style unread summary and mark-all-read.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move dashboard notification summary from gap to landed capability.
- Modify: `docs/product/team-collaboration-roadmap.md`
  - Record the new local notification summary foundation.
- Modify: `docs/product/figma-feature-inventory.md`
  - Update comment capability inventory.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record verification evidence after green.

## Tasks

### Task 1: Storage Notification Summary

- [x] Add failing storage test `comment notifications summarize unread threads by project file and mark a file read`.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts -t "comment notifications summarize"` and confirm it fails because `listCommentNotifications` is missing.
- [x] Implement `CommentNotificationSummary`, `listCommentNotifications`, and `markFileCommentsRead`.
- [x] Re-run the focused storage test and confirm it passes.

### Task 2: HTTP And MCP Surfaces

- [x] Add failing HTTP test for `GET /comments/notifications?viewerId=...` and `POST /files/:fileId/comments/read`.
- [x] Add failing MCP coverage for `list_comment_notifications` and `mark_file_comments_read`.
- [x] Implement the HTTP routes and MCP tools.
- [x] Re-run focused HTTP and MCP tests and confirm they pass.

### Task 3: Web API And File Panel UI

- [x] Add failing web API helper test for notification summary and mark-file-read calls.
- [x] Add failing Playwright CLI test that creates an unread comment, sees the file-panel notification count, clicks `현재 파일 읽음`, and verifies the count clears.
- [x] Implement web helpers, App state refresh, file-panel UI, and tokenized styles.
- [x] Re-run focused web API and Playwright CLI tests and confirm they pass.

### Task 4: Docs, Full Verification, And Publish

- [x] Update Penpot maturity and collaboration docs to reflect local dashboard-style comment notifications.
- [x] Run `git diff --check`.
- [x] Run `pnpm run check:design-rules`.
- [x] Run `pnpm run check:penpot-maturity`.
- [x] Run `pnpm --filter @layo/web build`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Start `pnpm dev`, verify `4317` and `5173`, then run `pnpm test:e2e`.
- [x] Commit, push, create PR, merge, sync `main`, remove worktree, delete local/remote branch, prune worktrees, remove generated artifacts, stop dev servers, and verify ports `5173` and `4317` are clear.
