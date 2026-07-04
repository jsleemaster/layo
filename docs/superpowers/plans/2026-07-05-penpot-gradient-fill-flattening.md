# 2026-07-05 Penpot Gradient Fill Flattening

## Goal

Close the next Penpot import/export maturity gap for gradient fills. Penpot supports `fill-color-gradient` records with typed gradients and color stops. Layo currently has a single solid `style.fill` plus opacity, so this slice adapts simple Penpot gradient fills by flattening their representative midpoint color into one deterministic Layo fill color and opacity.

## Penpot Benchmark Check

Reference source checked on 2026-07-05:

- `common/src/app/common/types/fills.cljc` accepts `:fill-color-gradient` in fill records and keeps `fills` as a vector-compatible collection.
- `common/src/app/common/types/color.cljc` defines gradients with `:type`, start/end geometry, and `:stops`, where each stop has `:color`, optional `:opacity`, and `:offset`.
- The same Penpot color source includes `interpolate-gradient`, which resolves a color from gradient stops at a requested offset.

Decision:

- Adopt: recognize Penpot `fill-color-gradient` records instead of falling back to the default gray rectangle.
- Adapt: because Layo does not yet have first-class gradient style metadata, flatten a gradient to its midpoint stop interpolation as one solid fill color and opacity.
- Diverge for now: gradient angle/radius fidelity, multiple gradient fills, blend modes, mixed image+gradient stacks, stroke gradients, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations remain follow-up gaps.

## RED Case

Add failing coverage before implementation:

- Server mapper: a Penpot rectangle with a linear gradient from `#ff0000` at offset `0` to `#0000ff` at offset `1` must import as a rectangle with `style.fill` `#800080` and `style.opacity` `1`.
- HTTP route: the same archive must review/import without assets and persist the flattened midpoint fill into `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show `Gradient card` and persist the flattened fill through the browser import path.

Expected current failure: Layo ignores `fill-color-gradient`, so the rectangle imports with the default rectangle fill instead of the interpolated midpoint color.

## GREEN Implementation Target

- Resolve a Penpot gradient record from `fill-color-gradient` / `fillColorGradient`.
- Sort stops by offset and interpolate at offset `0.5`.
- Return a deterministic six-digit hex fill and alpha opacity for the Layo single-fill model.
- Preserve existing solid-fill stack and image fill behavior.

## Verification Log

- RED Full Verification #28719962150: failed in Core tests because `Gradient card` imported as the default `#e5e7eb` fill instead of the expected flattened midpoint `#800080` fill.
- GREEN Full Verification #28720033921: passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.
- Direct Playwright CLI e2e proof: covered by #28720033921 through `apps/web/e2e/external-migration-penpot-assets.spec.ts`; the file-panel import persisted `Gradient card` as `#800080` with opacity `1`.
- Deployment: intentionally deferred for this loop.
