# Penpot Layout Min/Max Sizing

**Goal:** Move Layo's layout engine closer to Penpot-class flexible layout
behavior by adding minimum and maximum sizing rules for auto-layout containers
and layout children.

**Penpot reference:** Penpot Flexible Layouts:
https://help.penpot.app/user-guide/designing/flexible-layouts/

**Maturity gate:** Layout maturity in
`docs/product/penpot-maturity-benchmark.md`.

## Gap

Layo supports Flex and Grid metadata, fill/fit sizing, padding, margins,
alignment, distribution, track units, and named grid areas. It still lacks
minimum and maximum size rules, so fit containers can collapse or expand beyond
the intended product bounds and fill/stretch children cannot express design-tool
guardrails.

## Implementation

- Add optional `min_width`, `max_width`, `min_height`, and `max_height` fields
  to `NodeLayout` and `NodeLayoutItem`.
- Normalize size limits as non-negative numbers and ignore invalid or inverted
  max values.
- Clamp auto-layout container sizes after `fit` sizing and before children are
  positioned.
- Clamp layout child sizes before flow metrics are calculated and after
  fill/stretch/grid sizing changes.
- Expose Korean Inspector controls for selected layout frames and selected
  children inside layout parents.
- Keep the fields available through server storage, MCP commands, Rust serde,
  generated bindings, and code export metadata.

## RED Evidence

- `pnpm --filter @layo/web test -- src/editor-state.test.ts` failed because
  the fit frame stayed at `308 x 122` instead of clamping to `240 x 160`.
- `pnpm --filter @layo/server test -- src/storage.test.ts` failed because the
  server layout normalizer discarded `min_width`, `max_width`, `min_height`,
  and `max_height`.
- `cargo test -p editor-core layout_metadata_round_trips_through_json` failed
  because `NodeLayout` and `NodeLayoutItem` did not expose the min/max fields.
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "inspector layout min and max sizing" --workers=1 --reporter=line`
  failed because `inspector-layout-min-width` did not exist.

## Verification

- `pnpm --filter @layo/web test -- src/editor-state.test.ts`
- `pnpm --filter @layo/server test -- src/storage.test.ts`
- `cargo test -p editor-core layout_metadata_round_trips_through_json`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "inspector layout min and max sizing" --workers=1 --reporter=line`
- `pnpm --filter @layo/web typecheck`
- `pnpm --filter @layo/server typecheck`
- `cargo test -p editor-core`
- `pnpm run check:penpot-maturity`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "inspector layout min and max sizing" --headed --workers=1 --reporter=line`
- `git diff --check`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `pnpm test`
- `pnpm test:e2e` after starting `pnpm dev`

## Direct UI Proof

- Selected `랜딩 프레임`, switched layout to auto fit sizing, typed min width
  `220`, max width `240`, min height `160`, and max height `170`; the Inspector
  showed the selected frame clamped to `240 x 160`.
- Selected `헤드라인`, switched layout-item width and height to fill, typed max
  width `180` and max height `110`; the Inspector showed the child clamped to
  `180 x 110` at `x = 24`, `y = 20`.

## Remaining Risks

- Baseline alignment, direct viewport grid editing, and deeper resizing
  semantics remain separate layout maturity gaps.
