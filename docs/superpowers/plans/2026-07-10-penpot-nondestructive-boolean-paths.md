# Penpot Non-Destructive Boolean Paths Implementation Plan

**Goal:** Add Penpot-comparable non-destructive union, difference, intersection, and exclusion for first-class Layo paths while preserving editable source operands, deterministic agent control, undo/redo, inspect, and artifact output.

**Benchmark decision:** Adopt Penpot's product capability and adapt persistence to Layo's local-first Rust document model. Boolean results must remain editable relationships, not destructive one-time path flattening. Reference: https://help.penpot.app/user-guide/designing/booleans/ and https://github.com/penpot/penpot.

## Constraints

- Preserve source path operands and operation order.
- Keep MCP and HTTP command schemas identical.
- Support dry-run, apply, validation, change summary, undo/redo, and inspect.
- Render and export the evaluated result while keeping sources recoverable.
- Keep user-facing controls Korean-first.
- Deployment remains deferred and is not a merge gate.

## Task 1: RED document and evaluation contract

- [x] Add Rust/TypeScript round-trip tests for a boolean path relationship with operation `union | difference | intersection | exclusion` and ordered source node IDs.
- [x] Add geometry evaluator tests using overlapping closed paths, including even-odd operands and disjoint results.
- [x] Record the exact failing contract before implementation.

## Task 2: Deterministic agent mutations

- [x] Add create/update/detach boolean relationship commands through the shared MCP/HTTP batch.
- [x] Verify dry-run leaves storage unchanged and apply returns validation, inspect, and change-summary evidence.
- [x] Add one-command undo/redo persistence tests.

## Task 3: Canvas, direct controls, and artifacts

- [x] Add Korean-first boolean operation controls for multi-selected closed paths.
- [x] Render evaluated boolean geometry on canvas without deleting source operands.
- [x] Export the evaluated result to SVG/PDF/raster artifacts.
- [x] Add direct Playwright CLI proof for union, difference, intersection, exclusion, detach, undo, and redo.

## Task 4: Full verification and maturity evidence

- [x] Run maturity/design gates, typecheck, web build, core tests, and the full Playwright suite.
- [x] Update `docs/product/penpot-maturity-benchmark.md`, the boolean delta document, and `PLAN_STATUS.md`.
- [x] Review, merge, and perform post-merge cleanup before selecting the next Penpot gap.


## Completion Evidence

- Final GREEN: Full Verification #546, run `29100227669`.
- Gates, typecheck, web build, Core tests, and the full Playwright CLI suite passed.
- Product evidence: `docs/product/penpot-nondestructive-boolean-paths-delta.md`.
- Failure loop closed the missing deterministic path creation command, silent unknown-command acceptance, fixed-width toolbar input regression, rotated bounds, fill-rule, open-path, runtime relation validation, and persisted browser lifecycle cases.
