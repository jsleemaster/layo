# 2026-07-05 Penpot Frame Fill Image Background

## Goal

Close the next Penpot import/export maturity gap by importing a packaged Penpot
frame `fill-image` paint without dropping the frame's child layers.

The previous slice imported rectangle `fill-image` paints by adapting the
rectangle into a Layo `image` node. That is not enough for Penpot frames: a
frame can carry an image background while still owning child shapes. Mapping the
frame itself to an image node would lose or distort the frame/container role.

## Penpot Benchmark Check

Reference source checked on 2026-07-05:

- `common/src/app/common/types/fills.cljc` defines optional `:fill-image` in
  fill records and extracts image ids from fills.
- `common/src/app/common/types/color.cljc` defines image records with `:id`,
  `:width`, `:height`, and `:mtype`.

Decision:

- Adopt: read frame fill image ids from Penpot `fills[]` through the same
  packaged media/object asset path used for image shapes and rectangle image
  fills.
- Adapt: preserve the Layo frame node and insert a deterministic background
  `image` child before mapped Penpot child layers. This keeps local-first frame
  hierarchy and paint order without adding a new style paint stack model in this
  slice.
- Diverge for now: multiple frame fills, stroke images, masks, paths, SVG raw
  shapes, components, variants, tokens, and library relations remain follow-up
  gaps.

## RED Case

Add failing coverage before implementation:

- Server mapper: importing a Penpot ZIP with a frame whose first fill contains
  `"fill-image": { id, width, height, mtype }` and one child rectangle must
  produce a Layo frame with two children: a synthetic background image node first
  and the original foreground rectangle second.
- HTTP route: the same archive must persist the frame, background image node,
  foreground child, and asset bytes into `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show both the
  `Hero frame background` and `Foreground card` layers, persist both child
  nodes, and serve the background image bytes from `/assets/{assetId}`.

Expected current failure: Layo only resolves fill-image paints for rectangles,
so the frame imports without the packaged background asset and has only the
foreground child.

## GREEN Implementation Target

- Extract frame fill-image media ids without changing the existing image-shape
  and rectangle-fill behavior.
- Preserve frame `kind: "frame"`, geometry, name, and child mapping.
- Create a deterministic background image child id: `penpot-{frameId}-fill-image`.
- Insert the background image before existing children to preserve background
  paint order.
- Count the synthetic background image as a mapped node and mark its asset as
  used.

## Verification Log

- RED Full Verification `#28717852745` failed as expected on `mappedNodeCount` 2 instead of 3 and HTTP `assetCount` 0.
- Repair Full Verification `#28717920390` failed at TypeScript parse after the remote update path introduced escaped quote literals; the branch repairs that failure before GREEN.
- GREEN Full Verification `#28717969048` passed in 7m23s with Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.
- Direct Playwright CLI import proof passed through `apps/web/e2e/external-migration-penpot-assets.spec.ts`, including the layer panel and `/assets/{assetId}` byte checks.

## Remaining Follow-Ups

- Penpot stroke images and multi-fill paint stacks.
- Penpot masks, paths, SVG raw shapes, components, variants, tokens, and shared
  library relations.
