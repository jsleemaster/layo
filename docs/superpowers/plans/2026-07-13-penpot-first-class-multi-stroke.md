# Penpot First-Class Multi-Stroke Plan

**Goal:** Replace Layo's single-stroke ceiling with an ordered, first-class stroke stack that supports per-stroke color, opacity, width, position, style, visibility, dash/gap, and open-path endpoints across editor, agent, persistence, collaboration, and artifacts.

**Benchmark decision:** Adopt Penpot's multi-stroke product model. Flattening or selecting one stroke is migration fallback evidence, not team-product parity.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Task 1: Exact RED cases

- [ ] Add ordered two-stroke document, API, canvas, SVG, PDF, and PNG fixtures.
- [ ] Add inside, center, outside, hidden, and per-stroke opacity cases.
- [ ] Add direct Inspector add, reorder, duplicate, hide, and delete workflows.

## Task 2: Model and deterministic commands

- [ ] Define the Rust and TypeScript ordered stroke-stack contract with single-stroke migration compatibility.
- [ ] Add MCP/HTTP dry-run/apply, validation, summaries, persistence, and collaboration mapping.
- [ ] Preserve component instance overrides and code-export metadata.

## Task 3: Product surfaces

- [ ] Render ordered strokes on canvas without losing fills, gradients, or endpoints.
- [ ] Export faithful SVG/PDF/PNG bounds and paint order.
- [ ] Add Korean-first Inspector controls with undo/redo and reload proof.

## Task 4: Close and route

- [ ] Run the failure-learning loop and full verification.
- [ ] Review, merge, post-merge clean, and route the next exact Penpot gap.
