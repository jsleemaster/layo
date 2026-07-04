# 2026-07-05 Penpot Solid Multi-Fill Flattening

## Goal

Close the next Penpot import/export maturity gap for solid multi-fill paint stacks. Penpot supports `fills` as a vector of fill records. Layo currently has a single `style.fill` plus node opacity, so this slice adapts fully solid-color fill stacks by flattening their visual result into one deterministic Layo fill color and opacity.

## Penpot Benchmark Check

Reference source checked on 2026-07-05:

- `common/src/app/common/types/fills.cljc` defines `schema:fills` as a vector-compatible fill collection and exposes `MAX_FILLS`.
- Each fill record can contain `:fill-color`, `:fill-opacity`, `:fill-color-gradient`, or `:fill-image`.
- `prepend-fill` places new fills at the front of the collection, so import treats the vector as front-to-back paint order and composites from the back fill toward the front fill.

Decision:

- Adopt: import multiple solid Penpot fills rather than dropping all but the first fill.
- Adapt: because Layo does not yet have a multi-paint style stack, flatten solid-color fills into one visible color and opacity during import.
- Diverge for now: gradients, image fills inside mixed stacks, blend modes, stroke images, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up gaps.

## RED Case

Add failing coverage before implementation:

- Server mapper: a Penpot rectangle with a top `#ff0000` fill at 50% opacity over a bottom `#0000ff` fill at 100% opacity must import as a rectangle with `style.fill` `#800080` and `style.opacity` `1`.
- HTTP route: the same archive must review/import without assets and persist the flattened fill into `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show `Layered fill card` and persist the flattened fill through the browser import path.

Expected current failure: Layo reads only the first fill record, so the rectangle imports as red with opacity 0.5 instead of the composited purple result.

## GREEN Implementation Target

- Resolve all solid fill records in Penpot paint order.
- Composite from back to front using fill opacity.
- Return a deterministic six-digit hex fill and alpha opacity for the Layo single-fill model.
- Preserve existing image-shape, rectangle fill-image, and frame fill-image behavior.

## Verification Log

- RED Full Verification #28719300875: after fixing the test syntax setup, Core tests failed for the intended gap because the imported rectangle persisted `#ff0000` with opacity `0.5` instead of flattened `#800080` with opacity `1`.
- GREEN Full Verification #28719395620: passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e after solid fill stack flattening.
- Direct Playwright CLI e2e proof: included in #28719395620 through the root `test:e2e` run for `apps/web/e2e/external-migration-penpot-assets.spec.ts`; the file-panel import path persisted `Layered fill card` with flattened `#800080` and opacity `1`.
- Deployment: intentionally deferred for this loop.
