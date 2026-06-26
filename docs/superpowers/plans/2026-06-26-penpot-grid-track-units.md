# Penpot Grid Track Units

**Goal:** Move Layo's Grid layout closer to Penpot Flexible Layouts by adding
pixel, fraction, and auto track units for grid rows and columns.

**Penpot reference:** Penpot Flexible Layouts Grid units:
https://help.penpot.app/user-guide/designing/flexible-layouts/

**Maturity gate:** Layout maturity in
`docs/product/penpot-maturity-benchmark.md`.

## Gap

Layo's Grid layout already supported equal-cell auto-placement, manual
placement, and item spans, but every column and row shared the same computed
size. Penpot's grid model supports explicit track units, so real UI layouts
need non-equal tracks such as `120px 2fr 1fr` and `80px 1fr`.

## Implementation

- Add `GridTrack` metadata to the shared renderer model, server storage model,
  MCP schema, Rust document model, and generated TypeScript bindings.
- Add `layout.grid_column_tracks` and `layout.grid_row_tracks`.
- Resolve grid tracks as:
  - `px`: fixed pixel size,
  - `fr`: proportional share of remaining space,
  - `auto`: content-size based for single-track children.
- Keep existing equal-cell behavior by resolving missing tracks as repeated
  `1fr`.
- Add Korean Inspector fields for column and row track strings.

## RED Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts` failed because the
  second grid child still used equal-cell `x = 176.67` instead of the expected
  `x = 150`.
- `pnpm --filter @layo/server test -- src/storage.test.ts` failed because the
  server normalized away `grid_column_tracks` and `grid_row_tracks`.
- `cargo test -p editor-core layout_metadata_round_trips_through_json` failed
  because `GridTrack`, `GridTrackType`, and track fields did not exist.
- First focused Playwright CLI run failed with `ERR_CONNECTION_REFUSED` because
  the dev servers were not running. After starting `@layo/server` and
  `@layo/web`, the browser test exposed a test setup issue: grid direction was
  still vertical, so the test now explicitly sets `direction = horizontal`.

## Verification

- `pnpm --filter @layo/web test -- src/editor-state.test.ts`
- `pnpm --filter @layo/server test -- src/storage.test.ts`
- `cargo test -p editor-core layout_metadata_round_trips_through_json`
- `pnpm typecheck`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "inspector grid track units" --workers=1 --reporter=line`

## Remaining Risks

- Named grid areas, min/max track rules, baseline alignment, direct viewport
  grid editing, and deeper resizing semantics remain separate maturity gaps.
