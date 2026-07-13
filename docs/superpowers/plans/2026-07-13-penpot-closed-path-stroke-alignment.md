# Penpot Closed-Path Stroke Alignment Plan

**Goal:** Close the exact remaining multi-stroke fidelity gap by rendering
inside, center, and outside stroke layers on closed arbitrary paths with
geometry-aware canvas, SVG, PDF, and PNG behavior while keeping open paths
center-aligned.

**Benchmark decision:** Adopt Penpot's closed-shape stroke alignment semantics.
A metadata-only position flag or a centered stroke with expanded bounds is not
visual parity.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Task 1: Exact RED geometry

- [x] Add closed cubic, compound/even-odd, and rotated path fixtures with ordered
      inside/center/outside strokes.
- [x] Prove canvas pixels, SVG clipping/masking, PDF operators, and PNG bounds.
- [x] Prove open paths reject or normalize inside/outside to center.

## Task 2: Shared alignment semantics

- [x] Define one geometry-aware alignment resolver used by canvas and artifacts.
- [x] Preserve markers, dashes, opacity, fill rules, holes, and paint order.
- [x] Add deterministic validation and migration behavior for unsupported
      topology without silent flattening.

## Task 3: Product proof

- [x] Add Inspector path alignment interaction, undo/redo, persistence, reload,
      and collaboration proof.
- [x] Run the failure-learning loop and full verification.
- [x] Review, merge, post-merge clean, and route the next exact Penpot gap.


## Completion Evidence

PR #279 uses one shared closed-subpath topology resolver across the canvas,
SVG/PDF artifacts, and the server agent boundary. Closed cubic and compound
even-odd paths use doubled paint passes clipped to the interior or inverse
exterior; open paths normalize unsupported area alignment to center. The
Inspector exposes the effective position and disables unsupported choices.
Focused tests cover SVG clip/mask geometry, PDF clipping operators, mixed
topology, server normalization, canvas color bounds, PNG bounds, undo/redo, and
reload.

The RED run `29225628767` failed all three absent alignment contracts. Failure
learning then corrected path fill-rule clipping, remote large-file boundary
corruption, callback narrowing, missing E2E registration, and an inappropriate
Playwright matcher for disabled option elements. Full Verification
`29227360608` passed every gate and 188 Playwright cases; Storage Restore Drill
`29227360595` and Storage Backup Retention `29227360638` passed.
