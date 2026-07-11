# Penpot Path Flattening Implementation Plan

**Goal:** Add Penpot-comparable Flatten that converts selected closed shapes or a non-destructive boolean result into one standalone first-class Layo path while preserving visible geometry and reversible history.

**Benchmark decision:** Adopt Penpot's destructive Flatten capability, but keep the operation reviewable through dry-run and reversible through Layo undo/redo. Reference: https://help.penpot.app/user-guide/designing/layers/ and https://help.penpot.app/user-guide/first-steps/shortcuts/.

## Constraints

- Flatten must remove source relationships only after geometry evaluation succeeds.
- Preserve world-space bounds, rotation semantics, fill rule, style, curves, and artifact output.
- Keep MCP and HTTP schemas identical.
- Support inspect, dry-run, apply, validation, change summary, and one-step undo/redo.
- Keep user-facing controls Korean-first.
- Deployment remains deferred and is not a merge gate.

## Task 1: RED flatten contract

- [x] Add evaluator and model tests for paths, nested booleans, curves, even-odd holes, rotation, and invalid open geometry.
- [x] Record the exact pre-implementation failures.

## Task 2: Deterministic mutation

- [x] Add `flatten_path` through MCP/HTTP with dry-run/apply parity.
- [x] Verify source relationships are removed only in the persisted standalone path.
- [x] Add inspect, validation, change-summary, undo, and redo coverage.

## Task 3: Direct product workflow

- [x] Add a contextual Korean-first Flatten control and Penpot-compatible shortcut.
- [x] Verify canvas plus SVG/PDF/PNG fidelity through direct Playwright CLI interaction.
- [x] Cover selection, export, reload, and recovery boundaries.

## Task 4: Verification and handoff

- [x] Run maturity/design gates, typecheck, web build, Core tests, and the full Playwright suite.
- [x] Update the Penpot maturity benchmark and flatten delta.
- [x] Review, merge, run post-merge cleanup, and route the next exact Penpot gap.


## Completion evidence

- PR #275 implements closed-path and boolean-result Flatten across renderer, MCP/HTTP, editor history, Korean UI, shortcut, persistence, reload, and artifacts.
- RED Full Verification: `29150104717` failed because `flattenPathGeometry` was absent.
- Failure-loop runs `29150134360`, `29150262125`, and `29150314818` corrected invalid geometry expectations and the wrapped dry-run response assertion.
- GREEN code-head Full Verification: `29150553848` passed maturity/design gates, typecheck, web build, Core tests, and 185 Playwright CLI tests.
- Final head adds explicit reducer undo/redo and flattened SVG/PDF/PNG regressions; the final Full Verification run is the merge gate.
- Product delta: `docs/product/penpot-path-flattening-delta.md`.
- Next routed gap: `docs/superpowers/plans/2026-07-11-penpot-open-path-flattening.md`.
