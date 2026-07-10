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

- [ ] Add evaluator and model tests for paths, nested booleans, curves, even-odd holes, rotation, and invalid open geometry.
- [ ] Record the exact pre-implementation failures.

## Task 2: Deterministic mutation

- [ ] Add `flatten_path` through MCP/HTTP with dry-run/apply parity.
- [ ] Verify source relationships are removed only in the persisted standalone path.
- [ ] Add inspect, validation, change-summary, undo, and redo coverage.

## Task 3: Direct product workflow

- [ ] Add a contextual Korean-first Flatten control and Penpot-compatible shortcut.
- [ ] Verify canvas plus SVG/PDF/PNG fidelity through direct Playwright CLI interaction.
- [ ] Cover selection, export, reload, and recovery boundaries.

## Task 4: Verification and handoff

- [ ] Run maturity/design gates, typecheck, web build, Core tests, and the full Playwright suite.
- [ ] Update the Penpot maturity benchmark and flatten delta.
- [ ] Review, merge, run post-merge cleanup, and route the next exact Penpot gap.
