# Penpot Variant Area Layout Metadata

**Goal:** Move Layo's component variant workflow closer to Penpot by saving
variant-area layout metadata and exposing it through the right Inspector,
agent commands, HTTP, and the Rust document model.

**Penpot reference:** Penpot variants appear in a component variant area whose
layout is treated as part of the component set workflow:
https://help.penpot.app/user-guide/design-systems/components/#variants

**Adopt/adapt/diverge:** Adapt. Layo stores variant-area layout metadata on
`ComponentDefinition.variant_area` and exposes it through deterministic commands
instead of implementing the full direct canvas variant-area editing surface in
this slice.

**Maturity gate:** Design systems and agent safety.

## Gap

Layo could author variant definitions, combine sibling components as variants,
materialize variant-owned source trees, and preserve compatible overrides while
switching variants. It still did not store the variant area's own layout
direction, spacing, or padding, so humans and agents had no shared document
contract for how a generated variant component should be arranged.

## Implementation

- Added `ComponentDefinition.variant_area` with `horizontal`/`vertical`
  layout, gap, and padding metadata across renderer, server, MCP, agent,
  HTTP, Rust, and generated TypeScript bindings.
- Defaulted combined component variants and multi-variant definitions to a
  horizontal variant area with 32px gap and zero padding.
- Added undo/redo-safe web state support for `set_component_variant_area`.
- Added the `set_component_variant_area` agent command and
  `PATCH /files/:fileId/components/:componentId/variant-area` HTTP route.
- Added right Inspector controls for selected main component variant area
  layout, gap, and padding, persisted through the existing component save queue.

## RED Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "combines selected main components into a horizontal variant area layout" --runInBand` failed because combined variant components had no `variant_area`.
- `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "sets component variant area layout with undo and redo" --runInBand` failed because the reducer did not handle `set_component_variant_area`.
- `pnpm --filter @layo/server test -- src/http.test.ts -t "serves agent commands that edit component variant area layout" --runInBand` failed because agent command batches ignored `set_component_variant_area`.
- `cargo test -p editor-core component_variant_area_round_trips` failed because Rust serialization did not preserve `variant_area`.

## GREEN Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "combines selected main components into a horizontal variant area layout" --runInBand` passed.
- `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "sets component variant area layout with undo and redo" --runInBand` passed.
- `pnpm --filter @layo/server test -- src/http.test.ts -t "serves agent commands that edit component variant area layout" --runInBand` passed.
- `cargo test -p editor-core component_variant_area_round_trips` passed.
- `cargo test -p editor-core` passed and regenerated `ComponentDefinition`,
  `ComponentVariantArea`, and `ComponentVariantAreaLayout` TypeScript bindings.
- `pnpm --filter @layo/web typecheck` passed.
- `pnpm --filter @layo/server typecheck` passed.
- `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts -g "right inspector edits component variant area layout metadata" --workers=1 --reporter=line` passed.
- `pnpm run check:penpot-maturity` passed.
- `pnpm run check:design-rules` passed.
- `pnpm typecheck` passed.
- `pnpm --filter @layo/web build` passed.
- `pnpm test` passed.
- `pnpm test:e2e` passed with 134 Playwright CLI tests.
- `git diff --check` passed.

## Remaining Gaps

- Direct canvas visual editing of variant areas remains open.
- Variant-area auto-positioning/reflow of variant source nodes remains open.
- Broader effect/style override fidelity and hosted theme/library registry sync
  remain later design-system maturity slices.
