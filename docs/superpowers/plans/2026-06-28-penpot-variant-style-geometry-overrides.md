# Penpot Variant Style And Geometry Overrides

**Goal:** Preserve compatible component-instance stroke, opacity, and geometry
overrides when switching component variants.

**Penpot reference:** Penpot reusable design assets and component workflows:
https://help.penpot.app/user-guide/design-systems/assets/

**Adopt/adapt/diverge:** Adopt the user-facing expectation that instance
overrides survive compatible variant switches. Adapt the storage model to Layo's
existing deterministic `component_instance.overrides` array keyed by source node
ids instead of introducing a parallel variant override subsystem.

**Maturity gate:** Design systems and agent safety.

## Gap

Layo already preserved text and fill overrides across variant source-tree
switching, but stroke, stroke width, opacity, and direct geometry changes were
lost when an instance switched to another compatible variant. Agent command
batches also mutated saved files without recording those component-instance
overrides.

## Implementation

- Extended web editor state to record `stroke`, `stroke_width`, `opacity`, `x`,
  `y`, `width`, and `height` overrides for component-instance descendants.
- Extended server storage geometry updates with the same override sync.
- Added agent command `set_node_style` and wired agent `set_fill`,
  `set_node_style`, and `update_geometry` commands to record overrides after
  relayout.
- Kept the existing override contract as string `field/value` records so Rust
  and stored-file compatibility do not need a new schema migration.
- Skipped root-instance `x`/`y` override recording because instance placement is
  already preserved separately during variant switching.

## RED Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "variant source tree switches preserve compatible style and geometry overrides" --runInBand` failed because variant switching reset the child to the secondary source transform, size, stroke, stroke width, and opacity.
- `pnpm --filter @layo/server test -- src/storage.test.ts -t "component instance geometry overrides persist after switching variants" --runInBand` failed because storage variant switching reset child transform and size to the secondary source.
- `pnpm --filter @layo/server test -- src/storage.test.ts -t "agent commands preserve component instance style and geometry overrides after switching variants" --runInBand` failed because agent-applied style and geometry changes were not recorded as component-instance overrides.

## GREEN Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "variant source tree switches preserve compatible style and geometry overrides" --runInBand` passed.
- `pnpm --filter @layo/server test -- src/storage.test.ts -t "component instance geometry overrides persist after switching variants" --runInBand` passed.
- `pnpm --filter @layo/server test -- src/storage.test.ts -t "agent commands preserve component instance style and geometry overrides after switching variants" --runInBand` passed.
- `pnpm --filter @layo/web test -- src/editor-state.test.ts --runInBand` passed.
- `pnpm --filter @layo/server test -- src/storage.test.ts --runInBand` passed.
- `pnpm --filter @layo/server typecheck` passed.
- `pnpm run check:penpot-maturity` passed.
- `pnpm run check:design-rules` passed.
- `pnpm typecheck` passed.
- `pnpm --filter @layo/web build` passed.
- `pnpm test` passed.
- `pnpm test:e2e` passed with 133 Playwright CLI tests.
- `git diff --check` passed.

## Remaining Gaps

- Full variant-area layout editing remains open.
- Hosted theme/library registry sync remains open.
- Broader effect/style override fidelity beyond fill, stroke, opacity, text, and
  geometry remains a later design-system maturity slice.
