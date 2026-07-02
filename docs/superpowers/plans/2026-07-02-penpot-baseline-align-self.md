# Penpot Baseline Align-Self Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot/CSS-inspired per-item baseline self-alignment for auto-layout and grid children while preserving Layo's deterministic local-first document model.

**Architecture:** Extend the existing `align_self` contract to accept `baseline`, then make auto-layout and grid solvers compute a line/row baseline group whenever either the container or any child requests baseline alignment. Reuse existing baseline offset helpers and persistence paths instead of adding a new layout model.

**Tech Stack:** TypeScript renderer contracts, web editor reducer/layout solver, Fastify server storage contracts, Rust serde model, code export, Vitest, Playwright CLI e2e, GitHub Actions verification.

---

## Penpot Maturity Check

Penpot's Flexible Layout documentation frames Flex and Grid as CSS-standard layout primitives and says Inspect mode/code output should match web behavior. This slice adapts that expectation to Layo by allowing child-level baseline participation like CSS `align-self: baseline`, rather than only container-level `align-items: baseline`.

## Files

- Modify: `packages/renderer/src/index.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `crates/editor-core/src/lib.rs`
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/server/src/code-export.ts`
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

## Task 1: Add baseline to the shared child alignment contract

- [ ] Update `NodeLayoutItem.align_self` unions in renderer, server, and Rust model to include `baseline`.
- [ ] Update the web normalizer so `align_self: "baseline"` is retained instead of stripped.
- [ ] Add/adjust focused unit coverage that persists a child layout item with `align_self: "baseline"`.

## Task 2: Make auto-layout baseline grouping child-aware

- [ ] Add failing tests where a horizontal auto-layout container uses `align_items: "start"`, one child uses `align_self: "baseline"`, and a sibling text child with a different font size also requests baseline.
- [ ] Update single-line and wrapped-line auto-layout to compute baseline groups from children whose effective alignment is baseline.
- [ ] Ensure non-baseline siblings continue to use container alignment and stretch still sizes only stretch-aligned children.

## Task 3: Make grid baseline grouping child-aware

- [ ] Add failing tests where a grid container uses `align_items: "start"`, two children in the same row request `align_self: "baseline"`, and another row remains start-aligned.
- [ ] Reuse the existing grid row baseline map but ensure it works from child `align_self: "baseline"` even when the container is not baseline.

## Task 4: Expose and hand off baseline self alignment

- [ ] Add `baseline` to the Inspector layout-item align-self select options.
- [ ] Ensure code export emits `align-self: baseline;` when the selected item requests it.
- [ ] Add Playwright e2e coverage that sets item align-self to baseline, verifies the Inspector value, and verifies Dev handoff includes the baseline rule.

## Task 5: Document and verify

- [ ] Update `docs/product/penpot-maturity-benchmark.md` to move the baseline gap forward while keeping remaining CSS baseline group/fallback details explicit.
- [ ] Add this plan to `PLAN_STATUS.md` as active, then complete it after PR verification.
- [ ] Run GitHub Actions Full Verification, Storage Restore Drill, and Storage Backup Retention on the PR head.
- [ ] Record any remaining baseline limitations in the PR body.
