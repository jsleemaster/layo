# Plan: Penpot Different-Width Stroke Stack Import

## Goal

Close the next Penpot import/export maturity gap after solid same-width stroke
stack flattening: Penpot `strokes` records in one stack can carry different
`stroke-width` values, while Layo currently has one saved `style.stroke_width`.

## Penpot Benchmark Decision

- Reference capability: Penpot ordered stroke paint records in exported
  `.penpot` ZIP files.
- Decision: adapt, not fully adopt. Layo will continue flattening visible stroke
  color into one deterministic `style.stroke`, and will preserve the widest
  stroke width as the single Layo `style.stroke_width` so the imported shape does
  not lose its outer stroke extent.
- Deliberate divergence: exact per-paint stroke widths, exact inner/outer paint
  bands, stroke alignment, caps/dashes, blend modes, and future first-class
  multi-paint stroke preservation remain separate maturity gaps.

## Minimal-Change Ladder

1. Behavior belongs to the import/export maturity lane and is listed in
   `docs/product/penpot-solid-stroke-stack-maturity-note.md` as open.
2. Reuse the existing Penpot stroke stack fixture, importer paint flattening,
   HTTP persistence test, and file-panel Playwright e2e spec.
3. Extend only the stroke-width selection path instead of adding a new document
   model field.
4. Keep deployment deferred.

## RED Coverage

- `apps/server/src/external-migration.penpot-stroke-stack.test.ts` now includes a
  Penpot rectangle whose front stroke is 2px and back stroke is 8px, expecting
  imported `style.stroke_width` to be 8.
- `apps/web/e2e/external-migration-penpot-stroke-stack.spec.ts` verifies the same
  imported layer through the visible file-panel import flow and persisted HTTP
  document.

RED Full Verification #28723902377 failed in Core tests because the current
importer read the first stroke record and imported `stroke_width: 2` instead of
the expected widest width, 8.

## GREEN Implementation

`apps/server/src/external-migration-penpot.ts` now resolves the single Layo
stroke width from all Penpot `strokes` records. It keeps the existing flattened
stroke color path and imports the maximum valid `strokeWidth`, `stroke-width`, or
`width` value from the stack, falling back to 1 only when no width is present.

## Verification Log

- RED Full Verification #28723902377 failed as expected on `stroke_width: 2`
  versus expected 8.
- GREEN Full Verification #28724082389 passed Penpot maturity/design gates,
  typecheck, web build, Core tests, and Playwright CLI e2e.
- Deployment remains intentionally deferred for this loop.
