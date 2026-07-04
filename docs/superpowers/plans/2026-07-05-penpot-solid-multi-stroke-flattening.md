# 2026-07-05 Penpot Solid Multi-Stroke Flattening

## Goal

Close the next Penpot import/export maturity gap for simple multi-stroke paint stacks. Layo now imports solid fills, gradient fills, mixed fill-image stacks, and simple stroke gradients, but the Penpot mapper still reads only the first `strokes` record for stroke color. A Penpot rectangle with multiple visible solid strokes can therefore import with the wrong visible stroke color.

## Penpot Benchmark Check

Reference source checked on 2026-07-05:

- `common/src/app/common/types/shape/attrs.cljc` lists `:strokes` and stroke paint attributes including `:stroke-color`, `:stroke-opacity`, `:stroke-width`, and `:stroke-color-gradient` for editable shapes.
- `frontend/src/app/plugins/strokes.cljs` formats and exposes `strokes` arrays through plugin stroke proxies, including `strokeColor`, `strokeOpacity`, `strokeWidth`, and `strokeColorGradient`.

Decision:

- Adopt: treat Penpot `strokes` vectors as ordered paint-stack metadata during import.
- Adapt: because Layo's current saved document model has one CSS-like stroke color field, flatten same-width solid stroke stacks into a deterministic single stroke color by reusing the same front-to-back compositing behavior already used for solid fill stacks.
- Diverge for now: different-width stroke stack geometry, stroke alignment/caps/dashes, stroke images, blend modes, masks, and exact vector stroke rendering remain follow-up import/export gaps.

## RED Case

Add failing coverage before implementation:

- Server mapper: a Penpot rectangle whose `strokes` vector contains red at opacity 0.5 over blue at opacity 1, both width 4, must import with Layo `style.stroke` `#800080` and `stroke_width` 4 instead of the first stroke color `#ff0000`.
- HTTP route: the same archive must review/import without assets and persist the flattened stroke through `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show the stroked layer and persist the flattened stroke through the browser path.

Expected current failure: `penpotStrokeColor` reads only the first stroke record, so the solid multi-stroke fixture imports as `#ff0000` instead of `#800080`.

## GREEN Implementation Target

- Add a `penpotSolidStrokePaint` helper that mirrors `penpotSolidFillPaint` for stroke records.
- Reuse the existing gradient stroke fallback and RGBA compositing helpers.
- Keep current stroke width behavior for this slice by using equal-width strokes in the tested fixture.

## Verification Log

- RED Full Verification #28722912062 failed as expected in Core tests because Penpot solid stroke stacks imported as the first stroke color `#ff0000` instead of the expected flattened `#800080`; Playwright e2e skipped behind the failed core gate.
- GREEN Full Verification #28722958842 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e for implementation commit `bffa1331a8da503ad61d8297863f9d76b56ea6b1`.
- Storage Restore Drill #28722958828 passed for the same GREEN implementation head.
- Storage Backup Retention #28722958821 passed for the same GREEN implementation head.
- Direct Playwright CLI e2e proof: Full Verification #28722958842 ran root `pnpm test:e2e`, including `apps/web/e2e/external-migration-penpot-stroke-stack.spec.ts` registered in `package.json`, and proved the visible file-panel import persists `Layered stroke card` with stroke `#800080` and width 4.
- Deployment: intentionally deferred for this loop.
