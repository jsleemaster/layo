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

- [ ] Add closed cubic, compound/even-odd, and rotated path fixtures with ordered
      inside/center/outside strokes.
- [ ] Prove canvas pixels, SVG clipping/masking, PDF operators, and PNG bounds.
- [ ] Prove open paths reject or normalize inside/outside to center.

## Task 2: Shared alignment semantics

- [ ] Define one geometry-aware alignment resolver used by canvas and artifacts.
- [ ] Preserve markers, dashes, opacity, fill rules, holes, and paint order.
- [ ] Add deterministic validation and migration behavior for unsupported
      topology without silent flattening.

## Task 3: Product proof

- [ ] Add Inspector path alignment interaction, undo/redo, persistence, reload,
      and collaboration proof.
- [ ] Run the failure-learning loop and full verification.
- [ ] Review, merge, post-merge clean, and route the next exact Penpot gap.
