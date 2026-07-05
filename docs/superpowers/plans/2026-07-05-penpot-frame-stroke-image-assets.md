# Plan: Penpot Frame Stroke Image Asset Import

## Goal

Close the next Penpot import/export maturity slice for packaged frame
`stroke-image` paint records by preserving the referenced image asset in Layo's
local asset storage and imported document tree while keeping foreground frame
children intact.

## Penpot Benchmark Decision

- Reference capability: Penpot's current open-source shape schema allows
  `:stroke-image` as a valid stroke paint attribute, and frame shapes merge the
  same generic shape attributes that include `:strokes`.
- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/types/shape.cljc
- Decision: adapt. Layo does not yet have first-class image-backed stroke band
  rendering, so this slice preserves a packaged frame stroke-image as a
  deterministic Layo image child backed by local asset storage.
- Deliberate divergence: exact stroke-band tiling/compositing, independent
  per-paint stroke bands, and mixed image stroke stacks remain separate fidelity
  gaps.

## Minimal-Change Ladder

1. Behavior belongs to the import/export maturity lane and is still listed in
   the Penpot stroke-stack maturity note as an open frame stroke-image gap.
2. Reuse the existing Penpot media packaging reader, frame fill-image background
   adaptation shape, local asset storage, HTTP import routes, and file-panel
   Playwright import flow.
3. Add failing server and Playwright coverage first; the expected failure is
   that Layo imports the frame and foreground child but drops the frame
   `stroke-image` asset.
4. Implement only the frame stroke-image asset preservation slice.
5. Keep deployment deferred.

## RED Coverage

- `apps/server/src/external-migration.penpot-frame-stroke-image.test.ts`
  creates a `Frame stroke image board` frame with a packaged `stroke-image` PNG
  record and a `Foreground card` child, then expects import and HTTP persistence
  to keep one imported asset, add a deterministic `Frame stroke image board
  stroke image` image child first, and keep the foreground child second.
- `apps/web/e2e/external-migration-penpot-frame-stroke-image.spec.ts` runs the
  same archive through the visible file-panel import flow, checks the layer
  panel for the frame stroke image child plus foreground card, and verifies the
  persisted HTTP document and `/assets/{assetId}` bytes.

## Verification Log

- RED Full Verification #28726006772 failed as expected. Core tests showed the
  new frame stroke-image server fixture importing only 2 mapped nodes instead of
  3, and HTTP import returned `assetCount: 0` instead of `1`.
- GREEN Full Verification #28726205968 passed Penpot maturity/design gates,
  typecheck, web build, Core tests, and Playwright CLI e2e after frame
  `stroke-image` records mapped through the existing local asset path as
  deterministic frame image children.
- The GREEN Playwright CLI suite included
  `apps/web/e2e/external-migration-penpot-frame-stroke-image.spec.ts` at
  `[157/173]` and finished with `173 passed (5.5m)`.
- Storage Restore Drill #28726205973 and Storage Backup Retention #28726205979
  passed for the same GREEN head.
- Deployment remains intentionally deferred for this loop.
