# Penpot Flex Spacing Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for completed tracking.

**Goal:** Add Penpot-inspired direct flex spacing handles so selected frames can adjust padding and gap from the canvas while preserving Inspector persistence, undo/redo, and Playwright CLI proof.

**Architecture:** Adapt Penpot's visible spacing drag behavior by reusing Layo's existing `frame-spacing-overlay` segments instead of introducing a parallel overlay. Padding and gap edits should flow through the existing layout patch path so saved documents, HTTP persistence, undo/redo, and Dev handoff stay consistent.

**Tech Stack:** Vite React editor shell, existing editor-state layout commands, Playwright CLI e2e, GitHub Actions Full Verification.

---

## Penpot Maturity Check

Penpot's flexible layout docs say flex layout is grounded in CSS standards, exposes gap and padding properties, and lets users click and drag spacing values while seeing the edited value. It also defines `Shift` for opposite sides and `Alt` for all sides. Layo **adapts** this as direct canvas controls for selected frame spacing using the existing local-first document model and Inspector layout patch path.

Reference: https://help.penpot.app/user-guide/designing/flexible-layouts/

## Minimal Change Ladder

1. The behavior belongs to the layout maturity gate because Penpot treats spacing drag as part of flexible layout editing, not as decorative UI.
2. Layo already has `frame-spacing-overlay` readouts and Inspector layout inputs for padding/gap, so those primitives should be reused.
3. Browser pointer events and existing React state are enough; no new dependency is needed.
4. The existing layout model already stores `gap`, `row_gap`, `column_gap`, and `padding`, so the slice should not add schema fields.
5. New code should only make the existing overlay interactive, add focused drag math, and prove it through Playwright CLI.

## RED/GREEN Evidence

- FALSE GREEN: Full Verification `28587509647` passed because `pnpm test:e2e` explicitly ran only `editor-mvp.spec.ts` and `mcp-stdio.spec.ts`, so the new `flex-spacing-handles.spec.ts` was not included.
- RED: Full Verification `28587935143` failed in Playwright CLI e2e after adding the new spec to `package.json`'s e2e runner. Dragging `frame-padding-left` left `inspector-layout-padding-left` at `24` instead of `42`; Shift-drag left it at `20` instead of `32`.
- GREEN: Full Verification `28589375521` passed after implementing interactive frame spacing labels for padding and gap controls in `App.tsx`, with pointer targets enabled in `styles.css`.
- FAILURE LOOP: Full Verification `28589856915` failed because the new gap e2e expected a `frame-spacing-vertical` handle on the default landing frame without adding a second child; the overlay correctly had no sibling-spacing handle for that fixture.
- GREEN AFTER FAILURE LOOP: Full Verification `28590357552` passed after fixing the gap e2e fixture to add a rectangle child before verifying vertical sibling gap dragging.

## Files

- Modify: `package.json`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Add: `apps/web/e2e/flex-spacing-handles.spec.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: RED browser proof for missing direct spacing handles

- [x] Add a Playwright CLI e2e that selects the landing frame, enables auto layout, sets padding, drags the `frame-padding-left` overlay value, and expects the Inspector padding input to update.
- [x] Add `apps/web/e2e/flex-spacing-handles.spec.ts` to `pnpm test:e2e` after the first false-green run proved it was not included.
- [x] Run Full Verification on `codex/flex-spacing-handles` and record the expected RED failure.

## Task 2: Implement focused spacing drag math

- [x] Add focused inline helpers that map a spacing segment control, pointer delta, axis, zoom, and modifier keys into a layout patch.
- [x] Cover normal padding drag, `Shift` opposite-side padding drag, and `Alt` all-side padding drag through Playwright CLI e2e because the behavior depends on browser pointer targets and overlay hit testing.
- [x] Keep values integer, non-negative, and stable under viewport zoom by applying `viewport.scale` to client deltas before clamping.

## Task 3: Make frame spacing overlay interactive

- [x] Render spacing labels as pointer targets with Korean accessible labels and tooltips.
- [x] Start a drag session on pointer down, update the selected frame layout through the existing layout patch path, and commit through the current persistence flow.
- [x] Reuse existing `frame-spacing-overlay` segment ids for padding and sibling gap handles.
- [x] Keep the overlay dimensions stable during hover/drag by opening pointer events only on labels, not on the overlay container.

## Task 4: Verify modifier behavior in the live editor

- [x] Extend the Playwright CLI e2e to verify normal drag changes one side, `Shift` changes the opposite side too, and `Alt` changes all padding sides.
- [x] Add a gap-handle drag case when the selected auto-layout frame exposes sibling spacing.
- [x] Record the direct clicked/dragged actions and visible Inspector result in the PR body.

## Task 5: Document and finish the loop

- [x] Update the Penpot maturity benchmark to mark direct flex spacing handles as landed while keeping deeper resizing semantics explicit.
- [x] Update `PLAN_STATUS.md` with RED/GREEN evidence.
- [x] Run Full Verification on the branch.
- [ ] Run Storage Restore Drill and Storage Backup Retention on the PR branch.
- [ ] Open, self-review, and merge the PR when checks pass; run post-merge cleanup.

## Current Environment Note

This branch was implemented through the GitHub API because the current local filesystem session is read-only and local shell helpers repeatedly exit `134`. Deployment is intentionally deferred for this loop; verification focuses on repository tests and team-product maturity evidence.
