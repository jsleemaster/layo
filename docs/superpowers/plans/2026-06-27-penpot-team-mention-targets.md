# Penpot Team Mention Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Layo comment mentions from plain extracted strings toward Penpot-like team-member targeting by persisting resolved team member mention targets on comment threads, replies, and activity events.

**Architecture:** Keep the existing string `mentions` array for legacy compatibility, and add structured `mentionTargets` entries with `userId`, `displayName`, and `role`. The browser resolves typed `@displayName` or `@userId` mentions from the active `TeamManifest`; HTTP and MCP also accept explicit structured targets so agents can create targeted comments without relying on UI state.

**Tech Stack:** TypeScript, Fastify, MCP SDK, React, Vitest, Playwright CLI.

## Global Constraints

- Penpot reference capability: team comments with mention-style collaboration, using `https://help.penpot.app/user-guide/designing/workspace-basics/#comments`.
- Layo adapts this locally: team manifests remain client-owned, but comment sidecars persist resolved member targets when the UI or an agent supplies them.
- Preserve legacy comments by defaulting missing `mentionTargets` to `[]`.
- Keep comment sidecars outside `DesignFile`.
- Use TDD: write and run failing tests before production code.
- Use Playwright CLI for browser-visible verification.

---

## Product Contract

- A comment body such as `@민지 검수 부탁` may still persist `mentions: ["민지"]`.
- If the active team has a member `{ userId: "minji", displayName: "민지", role: "editor" }`, the same comment also persists `mentionTargets: [{ userId: "minji", displayName: "민지", role: "editor" }]`.
- Replies and retained activity events preserve the same structured targets.
- The Inspector renders targeted mention chips as `팀 멘션 민지`, while legacy unresolved mentions continue to render as `언급 민지`.
- HTTP and MCP creation paths accept `mentionTargets` for agents and external clients.
- This does not yet implement live comment sync or external delivery notifications; those remain separate team-product gaps.

## File Map

- Modify: `apps/server/src/storage.ts`
  - Add structured mention target types, input types, parsing, validation, persistence, and activity propagation.
- Modify: `apps/server/src/storage.test.ts`
  - Add RED/GREEN coverage for thread, reply, legacy parse, and activity `mentionTargets`.
- Modify: `apps/server/src/http.ts`
  - Pass optional `mentionTargets` from comment create/reply payloads.
- Modify: `apps/server/src/http.test.ts`
  - Verify HTTP accepts and returns structured team mention targets.
- Modify: `apps/server/src/mcp.ts`
  - Add `mentionTargets` schemas to `create_comment_thread` and `add_comment_reply`.
- Modify: `apps/server/src/mcp.test.ts`
  - Verify MCP-created comments/replies preserve team mention targets.
- Modify: `apps/web/src/document-api.ts`
  - Add mention target types to comments/activity and pass optional target arrays in create/reply helpers.
- Modify: `apps/web/src/document-api.test.ts`
  - Verify helper request bodies include structured mention targets.
- Modify: `apps/web/src/App.tsx`
  - Resolve active-team members from comment body/reply body and render targeted chips in the Inspector.
- Modify: `apps/web/src/styles.css`
  - Reuse existing chip styling or add tokenized class only if the targeted chip needs a distinct readable state.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI regression proving active team member mention targeting is visible and persisted.
- Modify: `docs/product/penpot-maturity-benchmark.md`
  - Move real team-member mention targeting from the open comment-workflow gap into the landed collaboration posture.
- Modify: `docs/product/team-collaboration-roadmap.md`
  - Record the landed local team-member mention target foundation.
- Modify: `docs/product/figma-feature-inventory.md`
  - Update comments inventory from unresolved mention strings to structured team targets.
- Modify: `docs/superpowers/PLAN_STATUS.md`
  - Record implementation and verification evidence.

## Tasks

### Task 1: Storage Team Mention Targets

- [x] Add failing storage test `comment threads persist structured team mention targets`.
- [x] Run `pnpm --filter @layo/server test -- src/storage.test.ts -t "structured team mention targets"` and confirm it fails because `mentionTargets` is missing.
- [x] Add `StoredCommentMentionTarget`, input parsing, legacy default `mentionTargets: []`, and structured targets to threads, replies, and activity events.
- [x] Re-run the focused storage test and confirm it passes.

### Task 2: HTTP And MCP Mention Target Surfaces

- [x] Add failing HTTP coverage for create/reply payload `mentionTargets`.
- [x] Add failing MCP coverage for `create_comment_thread` and `add_comment_reply` `mentionTargets`.
- [x] Implement HTTP and MCP schema/input plumbing.
- [x] Re-run focused HTTP and MCP tests and confirm they pass.

### Task 3: Web API And Inspector Team Target UI

- [x] Add failing web API helper test for `mentionTargets` request bodies.
- [x] Add failing Playwright CLI test that creates a team with member `민지`, shares the project, comments with `@민지`, and sees `팀 멘션 민지`.
- [x] Implement web API types, active-team mention resolution, create/reply target passing, and targeted chip rendering.
- [x] Re-run focused web API and Playwright CLI tests and confirm they pass.

### Task 4: Docs, Full Verification, And Publish

- [x] Update Penpot maturity and collaboration docs to reflect structured local team-member mention targets.
- [x] Run `git diff --check`.
- [x] Run `pnpm run check:design-rules`.
- [x] Run `pnpm run check:penpot-maturity`.
- [x] Run `pnpm --filter @layo/web build`.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Start `pnpm dev`, verify `4317` and `5173`, then run `pnpm test:e2e`.
- [x] Commit, push, create PR, merge, sync `main`, remove worktree, delete local/remote branch, prune worktrees, stop dev servers, and verify ports `5173` and `4317` are clear.

## Verification Log

- RED: `pnpm --filter @layo/web typecheck` failed because `CreateCommentThreadInput` and `CreateCommentReplyInput` did not expose `mentionTargets`.
- GREEN: `pnpm --filter @layo/web typecheck`.
- GREEN: `pnpm --filter @layo/web test -- src/document-api.test.ts -t "comment API helpers"`.
- RED: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "comments panel resolves current team members as mention targets" --workers=1 --reporter=line` failed because the Inspector rendered `언급 민지` but not `팀 멘션 민지`.
- GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "comments panel resolves current team members as mention targets" --workers=1 --reporter=line`.
- GREEN: `git diff --check`.
- GREEN: `pnpm run check:design-rules`.
- GREEN: `pnpm run check:penpot-maturity`.
- GREEN: `pnpm --filter @layo/web build`.
- GREEN: `pnpm typecheck`.
- GREEN: `pnpm test`.
- GREEN: `pnpm test:e2e` passed 93 Playwright CLI tests.
