# Penpot Flex Reverse Direction

**Goal:** Move Layo's flexible layout behavior closer to Penpot by supporting
reverse row and reverse column flow directions.

**Penpot reference:** Penpot Flexible Layouts:
https://help.penpot.app/user-guide/designing/flexible-layouts/

**Maturity gate:** Layout maturity in
`docs/product/penpot-maturity-benchmark.md`.

## Gap

Layo supports horizontal and vertical auto-layout flow, wrapping, margins,
fit/fill sizing, min/max sizing, grid placement, track units, and named grid
areas. Penpot flexible layouts also support reversed row and column directions.
Without those directions, Layo cannot mirror common design-tool flows such as
right-to-left toolbar groups or bottom-to-top stacks.

## Implementation

- Extend `NodeLayout.direction` to include `horizontal_reverse` and
  `vertical_reverse` across web, server, MCP, Rust serde, and generated TS
  bindings.
- Preserve reverse directions during layout normalization.
- Treat `vertical_reverse` as a vertical axis and `horizontal_reverse` as a
  horizontal axis for sizing, wrapping, fill/fit behavior, and grid defaults.
- Place flex children from the main-axis end edge when direction is reversed,
  while keeping cross-axis alignment unchanged.
- Use the end-side margin as `mainBefore` for reversed flows so spacing follows
  the visual flow direction.
- Extend grid auto placement traversal so horizontal reverse fills from right
  to left and vertical reverse fills from bottom to top.
- Expose the reverse options in the Inspector direction select with Korean UI
  labels.

## RED Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts --runInBand`
  failed because `horizontal_reverse` placed the first child at `x = 20`
  instead of `x = 140`, and `vertical_reverse` placed it at `y = 20` instead of
  `y = 212`.
- `cargo test -p editor-core layout_metadata_round_trips_through_json` is
  expected to fail until `LayoutDirection` exposes reverse variants.

## Verification

- `pnpm --filter @layo/web test -- src/editor-state.test.ts --runInBand`
- `pnpm --filter @layo/server test -- src/storage.test.ts`
- `cargo test -p editor-core layout_metadata_round_trips_through_json`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "inspector layout reverse direction" --workers=1 --reporter=line`
- `pnpm --filter @layo/web typecheck`
- `pnpm --filter @layo/server typecheck`
- `pnpm run check:penpot-maturity`
- `git diff --check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e` after starting `pnpm dev`

## Remaining Risks

- Baseline alignment, direct visual grid editing, responsive variants, and
  deeper Penpot import/export parity remain separate product maturity gaps.
