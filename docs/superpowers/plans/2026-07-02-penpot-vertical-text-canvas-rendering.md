# Penpot Vertical Text Canvas Rendering

Date: 2026-07-02

## Goal

Close the next Penpot maturity loop case for layout: vertical writing mode must
be visible on Layo's browser canvas, not only persisted in document metadata or
exported in developer handoff.

## Penpot Comparison

- Reference: Penpot open-source product class and layout/editor maturity target,
  `https://github.com/penpot/penpot`.
- Reference: Penpot flexible-layout maturity lane,
  `https://help.penpot.app/user-guide/designing/flexible-layouts/`.
- Decision: adapt. Layo keeps its existing local-first `TextWritingMode` document
  field and CSS `writing-mode` handoff, but renders vertical writing mode in
  Konva as clipped upright glyph columns because the canvas renderer is not a
  CSS layout engine.

## Failure Case

`docs/product/penpot-maturity-benchmark.md` listed full visual vertical text
rendering as the first remaining layout maturity gap. The existing Playwright
coverage only proved Inspector persistence and Dev Panel handoff;
`apps/web/src/App.tsx` still rendered every text node with a plain Konva
`<Text>` and ignored `node.content.writing_mode` on the canvas.

## Implementation

- Add a canvas helper that recognizes `vertical_rl` and `vertical_lr`.
- Split text into glyphs, flow them top-to-bottom, and advance columns right-to-left
  or left-to-right inside the saved node bounds.
- Clip the vertical glyph group to the node bounds and keep existing fill, font,
  opacity, selection, drag, resize, and shadow-stack rendering paths.
- Add Playwright CLI pixel-bound coverage that first proves the same text is
  horizontal, then switches the Inspector writing mode and proves the visible
  colored canvas pixels become taller than wide.
- Update the Penpot maturity benchmark with the landed slice and remaining
  glyph-orientation/baseline/resizing gaps.

## Verification

Planned PR verification:

- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "text inspector renders vertical writing mode visibly on the canvas" --workers=1 --reporter=line`
- `pnpm run check:penpot-maturity`
- `pnpm run check:design-rules`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `pnpm test`
- `pnpm test:e2e`

## Remaining Risks

- Upright glyph columns are a product-aligned visual baseline, not full
  typography parity. Glyph orientation controls, punctuation orientation, deeper
  CSS baseline group semantics, and remaining resizing semantics stay in the
  benchmark as follow-up layout gaps.
