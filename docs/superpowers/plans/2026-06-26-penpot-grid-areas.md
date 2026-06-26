# Penpot Grid Areas

**Goal:** Move Layo's Grid layout closer to Penpot Flexible Layouts by adding
named grid areas that can place children across a rectangular group of cells.

**Penpot reference:** Penpot Flexible Layouts Grid areas:
https://help.penpot.app/user-guide/designing/flexible-layouts/

**Maturity gate:** Layout maturity in
`docs/product/penpot-maturity-benchmark.md`.

## Gap

Layo's Grid layout already supported equal-cell auto-placement, manual
placement, item spans, and pixel/fraction/auto track units. It still lacked the
Penpot-style area concept where a frame defines a named area and a child can be
assigned to that area instead of manually entering row/column placement.

## Implementation

- Add `GridArea` metadata to the shared renderer model, server storage model,
  MCP schema, Rust document model, and generated TypeScript bindings.
- Add `layout.grid_areas` and `layout_item.grid_area`.
- Normalize grid areas as named, one-based rectangular placements with clamped
  row/column spans.
- Let `layout_item.grid_area` take placement precedence over manual
  row/column/span values when the named area exists.
- Reserve named-area cells during auto-placement so later auto children skip
  occupied cells.
- Add Korean Inspector controls for frame area definitions and child area name
  assignment.

## RED Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts` failed because the
  child assigned to `hero` stayed in the first cell at `x = 23` instead of the
  named area at `x = 147`.
- `pnpm --filter @layo/server test -- src/storage.test.ts` failed because the
  server normalized away `grid_areas`.
- `cargo test -p editor-core layout_metadata_round_trips_through_json` failed
  because `GridArea`, `NodeLayout.grid_areas`, and
  `NodeLayoutItem.grid_area` did not exist.
- First focused Playwright CLI run failed with `ERR_CONNECTION_REFUSED` because
  dev servers were not running; after starting `pnpm dev`, the same browser
  flow passed.

## Verification

- `pnpm --filter @layo/web test -- src/editor-state.test.ts`
- `pnpm --filter @layo/server test -- src/storage.test.ts`
- `cargo test -p editor-core layout_metadata_round_trips_through_json`
- `pnpm --filter @layo/web typecheck`
- `pnpm --filter @layo/server typecheck`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "inspector grid named areas" --workers=1 --reporter=line`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `cargo test -p editor-core`
- `git diff --check`
- `pnpm test`
- `pnpm test:e2e`

## Remaining Risks

- Min/max track rules, baseline alignment, direct viewport grid editing, and
  deeper resizing semantics remain separate layout maturity gaps.
