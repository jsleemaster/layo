# Penpot Comment Management Implementation Plan

**Goal:** Close Penpot-comparable comment ownership, edit/delete, team
authorization, reviewability, and crash-recovery gaps without weakening Layo's
local-first architecture.

**Architecture:** Keep comment data in canonical per-file sidecars. Bind every
read and mutation to an exact project sharing boundary, serialize sidecar and
transaction paths across processes, expose the same contract through HTTP and
review-first MCP, and make the Korean browser recover user drafts from stale or
deleted remote state.

**Tech Stack:** Fastify, TypeScript, filesystem transaction journals, MCP,
React, Vitest, Playwright CLI.

## Task 1: Record The Penpot Comparison

- [x] Verify the current Penpot `develop` head and official comment workflow.
- [x] Record the Adapt decision and selected-node/local-sidecar divergence.
- [x] Map the gap to collaboration, operations, agent-safety, and failure-loop
  maturity gates.

## Task 2: Define Ownership And Concurrency RED

- [x] Reproduce lost comment/event updates across concurrent storage instances.
- [x] Require stable thread/reply owners and monotonic `modifiedAt` versions.
- [x] Require owner-only edit/delete and stale-version no-write conflicts.
- [x] Require edit/delete activity and content-free deletion tombstones.

## Task 3: Implement Storage, HTTP, And MCP Contracts

- [x] Add canonical sidecar mutation locks and durable owner/version metadata.
- [x] Add thread/reply edit/delete storage and HTTP routes.
- [x] Recheck exact project authorization at the locked sidecar boundary.
- [x] Scope mixed-project feeds before limiting results.
- [x] Derive trusted actors from team credentials and retain viewer feedback.
- [x] Re-authenticate comment SSE and stop polling after terminal authorization.
- [x] Add MCP review/dry-run/commit for comment mutations.

## Task 4: Implement Korean Browser Management

- [x] Add owner edit/delete controls for threads and replies.
- [x] Hide owner controls for foreign comments while keeping viewer feedback.
- [x] Show trusted team actor names instead of payload-supplied identities.
- [x] Preserve and merge drafts after stale conflicts or remote deletion.
- [x] Refresh edit/delete events without reloading the page.

## Task 5: Close Storage Review Findings

- [x] Reserve case-folded project, document, library, and comment identities.
- [x] Make file/project/external imports atomic and explicitly idempotent.
- [x] Serialize library snapshots, product writes, rollback, and recovery.
- [x] Add real hard-exit seams for imports, duplication, publication, and
  project deletion.
- [x] Recover generic transaction journals before cold project metadata writes.
- [x] Acquire coordinator before cold library target locks.
- [x] Keep the transaction coordinator held through project lock acquisition and
  the project mutation so recovery cannot overwrite a new commit.
- [x] Replace externally queued startup recovery with a cached preflight-only
  promise so nested cold operations cannot wait on their own active import.
- [x] Delete canonical and legacy comment sidecars with a document's last
  project reference while retaining comments for shared references.

## Task 6: Verify The Product Slice

- [x] Run focused storage, HTTP, MCP, web API, and browser regressions.
- [x] Run the complete server suite: 562 tests, zero failures.
- [x] Run full workspace typecheck, Rust workspace tests, and web build.
- [x] Run direct headed Playwright CLI interaction passes at 7/7 for the latest
  async-state set and 1/1 for the stabilized initial-refresh case.
- [x] Run 30/30 comment product flows, 21/21 mixed ordering repetitions, and
  10/10 stabilized initial-refresh repetitions locally.
- [x] Run exact-code/test-head Full Verification `31318544219` at 283 web, 562
  server, 18 renderer, 39 collaboration, seven relay, 117 Rust, and 253/253
  Playwright cases with no retry.
- [x] Obtain independent exact-head re-review with no P0-P2 findings.

## Task 7: Document, Merge, And Clean Up

- [x] Add the product delta and current Penpot source.
- [x] Update the maturity benchmark and active-plan routing.
- [x] Update PR #319 with failure mode, RED/GREEN, direct browser proof, and
  remaining divergence.
- [x] Run Full Verification on the final documentation head.
- [x] Resolve review threads and mark the PR ready.
- [x] Merge PR #319 and confirm issue #318 state.
- [x] Run the required post-merge branch, worktree, and remote cleanup checks.
- [x] Publish the final MD cleanup state with merge evidence and no active plan.

## Task 8: Repair Legacy Ownership And Review Timing

- [x] Reproduce the post-merge P1 with focused storage, HTTP, MCP, and browser
  RED coverage.
- [x] Record that a configured review can begin only after a draft becomes
  ready and must remain pending until a result or bounded timeout.
- [x] Preserve missing-author provenance as `legacyOwnership` instead of
  treating a display-name fallback as a stable owner.
- [x] Add explicit team-owner and private local-operator assignment for legacy
  threads and replies through storage, HTTP, review-first MCP, and Korean
  browser controls.
- [x] Run focused and full verification plus direct Playwright CLI interaction.
- [ ] Obtain exact-head independent and configured GitHub review on PR #320.
- [ ] Merge PR #320, resolve the PR #319 finding, publish final MD cleanup, and
  run the strengthened post-merge worktree checks.

## Current Evidence

- Latest Penpot reference:
  `b5bec4f983b5540a3ed7969121badf08a14f384e`.
- Final focused storage RED: Full Verification `31297080928`, seven intended
  failures and 552 passing server tests.
- Consolidated browser RED: Full Verification `31316640082`, four intended
  failures and 249 passing Playwright cases.
- Implementation run `31317448727` was green but retained one flaky retry and
  therefore was not accepted as final evidence.
- Final code/test GREEN: head
  `a3551a84b7e2d61bda88eb3713ccea68a61f8005`, Full Verification
  `31318544219`, 253/253 Playwright without retry, and independent P0-P2-clean
  review.
- Final documentation-head GREEN: head
  `8e8bcd4463d732d40b36abcfabd2663edc44796b`, Full Verification
  `31319646399`, 283 web, 562 server, 18 renderer, 39 collaboration, seven
  TypeScript relay, 117 Rust, and 253/253 Playwright without retry. Storage
  Restore `31319646390`, Authorization Backup `31319646418`, and Retention
  `31319646398` also passed.
- Pre-ready review re-fetches were empty, but the configured Codex review began
  after ready and posted an unresolved P1 after merge: legacy sidecars without
  `authorId` are parsed with the display name `사용자`, which cannot match a
  stable authenticated team user ID for edit or delete.
- PR #319 squash-merged as
  `e87fe7e0e980ba7375a734ac08767b6af2a51e14` and issue #318 closed on
  2026-08-09. The remote feature branch was deleted separately after the
  multi-worktree local cleanup step of `gh pr merge --delete-branch` exited
  nonzero; the already-successful remote merge was verified before cleanup.
- Required status, branch, worktree, and remote-ref checks completed. Active or
  user-owned worktrees remain explicit cleanup exceptions until the closeout PR
  finishes; no unknown changes were removed.
- The first local closeout maturity gate failed one of seven checks because two
  historical plan filenames sat above the canonical Completed boundary. The
  repaired routing structure passed `pnpm check:penpot-maturity` at 7/7.
- PR #320 RED head `b6e174028116a0891f4c248417ccfbd9701a2063`
  failed the missing storage provenance, HTTP route, MCP tool, and two browser
  owner markers in Full Verification `31323183601`.
- Implementation head `2c2954e9f9252d3bb968df50875b529af0daaf83`
  passed Full Verification `31324584270`: 284 web, 566 server, 18 renderer, 39
  collaboration, seven TypeScript relay, 117 Rust, and 254/254 Playwright.
  Authorization Backup `31324584256`, Restore `31324584258`, and Retention
  `31324584257` also passed.
- Local review found that the first repair left private legacy comments blocked
  without an assignment UI. The focused team/private browser pair passed 2/2;
  the private flow passed headed 1/1 with visible pre/post assignment controls.
- Independent review then found that an arbitrary mistaken owner could not be
  corrected after assignment and that MCP edit/delete dry-run approved unresolved
  legacy items that commit rejected. Migrated legacy records now remain
  reassignable, modern records remain ineligible, and all four mutation reviews
  return `legacy_owner_unassigned` before commit.
- The first review follow-up passed 567 server and 284 web tests. Team reassignment
  passed headed 1/1 with pre/post visual inspection, and the complete browser
  suite passed 255/255 without retry.
- Superseded head `06fce31df5d3af751b4a2016f7cf367625a2b4b3`
  passed Full Verification `31328690712` and all three drills, but exact-head
  review found that PR #319 could already have persisted a synthetic owner ID
  into a `v1` sidecar and that reconnect selected the first member instead of
  the stored owner. Green CI did not override those product findings.
- Sidecar `v2` now establishes stable-owner provenance; every unmarked `v1`
  record is conservatively recoverable, including already-reserialized thread
  and reply IDs. Selector defaults follow draft, stored owner, then first target.
  Focused coverage also verifies all four rejected MCP commits, reply
  reassignment, modern reply blocking, and team-editor control absence.
- Latest local verification passed 521 server tests with 47 skipped, 284/284
  web tests, workspace typecheck, production build, maturity 7/7, design rules,
  headed team reconnect 1/1 with three inspected states, and full Playwright
  255/255 without retry.
- Head `7eccbaae9362a035dcc51848c0901bce35d9c765` passed Full Verification
  `31331290743`, all three drills, and independent review with no P0-P2. The
  configured exact-head review still found that thread assignment replaced
  `readBy`, creating false unread notifications for prior readers. Focused
  storage and browser RED both now pass after preserving existing receipts and
  adding the new owner uniquely. A final headed 1/1 pass visibly removed the
  unread badge before assignment and kept it absent after assigning `민지`.
- Superseded head `83e6c3a0fcf49dbd8d921cb39d34b21e0133fb48`
  passed Full Verification `31333603394` and all three drills, but independent
  exact-head review found that later thread/reply edits rewrote matching
  `ownership_assigned` activity bodies. Focused storage and browser RED showed
  the audit messages replaced by edited content. An explicit content-activity
  allowlist now keeps ownership/deletion messages immutable; focused GREEN and
  headed 1/1 activity-feed inspection preserve both thread and reply assignment
  messages after edits.
- Superseded head `26042fe2d4839c6e707946fd386b7aaac962bbf2`
  passed Full Verification `31334871380` and all three drills, but independent
  exact-head review found stale owner selector drafts survived remote
  reassignment and could silently revert it with the new persisted version.
  Thread/reply drafts now bind owner intent to selection-time `modifiedAt`.
  Focused SSE RED failed with stale `team-owner` after remote `team-reviewer`;
  GREEN and headed 1/1 inspection show both selectors as `준호`, and follow-up
  requests carry `team-reviewer` plus the remote versions.
- The first local full browser run also exposed a transient boolean-path polling
  reader that dereferenced a non-success response. Returning an empty poll
  sample made the exact case pass 10/10 and the complete 255/255 run.
- Another exact-head independent re-review/configured review, final CI, merge, PR #319 thread
  resolution, and post-merge MD/worktree cleanup remain. PR #320 is still active.
