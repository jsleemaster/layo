# 2026-07-05 Penpot Fill Image Paints

## Goal

Close the next Penpot import/export maturity gap by importing a packaged Penpot
rectangle `fill-image` paint as a Layo image node backed by local asset storage.

This follows the Penpot maturity loop after `2026-07-05-penpot-zip-image-assets.md`:
Layo already imports packaged Penpot `image` shapes, but Penpot also stores image
paints inside fill records. A common Penpot rectangle with an image fill should
not degrade into a plain rectangle or drop the referenced asset.

## Penpot Benchmark Check

Reference source checked on 2026-07-05:

- `common/src/app/common/types/fills.cljc` defines fill attrs with optional
  `:fill-image`, extracts fill image ids from fills, and exposes `:image` from
  fill records.
- `common/src/app/common/types/color.cljc` defines image records with
  `:width`, `:height`, `:mtype`, `:id`, optional `:name`, and optional
  `:keep-aspect-ratio`.

Decision:

- Adopt: read Penpot `fill-image` / `fillImage` records from `fills[]` and map
  their `id` through the packaged `files/{fileId}/media/{mediaId}.json` plus
  `objects/{storageObjectId}.{ext}` asset path already used for image shapes.
- Adapt: represent a rectangle image paint as a Layo `image` node with
  `fit_mode: "fill"`, because the current Layo node model does not yet expose
  arbitrary image paint stacks on rectangle style.
- Diverge for now: child-preserving frame background images, stroke images,
  multiple fills, masks, paths, SVG raw shapes, components, variants, tokens,
  and library relations remain follow-up gaps.

## RED Case

Add failing coverage before implementation:

- Server mapper: importing a Penpot ZIP with a `rect` whose first fill contains
  `"fill-image": { id, width, height, mtype }` must produce a child Layo
  `kind: "image"` node and one imported asset.
- HTTP route: the same archive must persist the image node and asset bytes into
  `FileStorage`.
- File-panel Playwright e2e: uploading the `.penpot` archive must show the
  imported layer and serve the asset bytes from `/assets/{assetId}`.

Expected current failure: Layo only resolves image assets from `type: "image"`
shape metadata, so the filled rectangle imports as a plain rectangle with empty
content and no used asset.

## GREEN Implementation Target

- Extract the first fill-image media id from Penpot fill records, supporting
  both kebab-case `fill-image` and camelCase `fillImage` JSON keys.
- Reuse the existing package media map and `imageContentForAsset(..., "fill")`.
- Keep the existing image-shape behavior unchanged.
- Preserve current geometry, parent-relative transforms, opacity, asset metadata,
  and local asset storage behavior.

## Verification Log

- RED Full Verification: pending.
- GREEN Full Verification: pending.
- Direct Playwright CLI import proof: pending through
  `apps/web/e2e/external-migration-penpot-assets.spec.ts`.

## Remaining Follow-Ups

- Penpot frame background image fills without losing children.
- Penpot stroke images and multi-fill paint stacks.
- Penpot masks, paths, SVG raw shapes, components, variants, tokens, and shared
  library relations.
