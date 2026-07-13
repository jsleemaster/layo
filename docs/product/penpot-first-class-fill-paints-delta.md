# Penpot First-Class Fill Paints Delta

Last checked: 2026-07-13

## Decision

Adopt Penpot's unlimited ordered fill model with per-fill solid, gradient, or
image ownership, visibility, opacity, and blend mode. Adapt image references to
Layo's local asset store. Keep scalar `style.fill` only as a legacy fallback;
do not retain authoritative fill ownership in parallel `paint_sources` or
synthetic image children.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Landed Product Behavior

- Renderer, server storage, and Rust models expose ordered `NodeFill` entries
  with tagged solid, gradient, and image paints.
- Validated MCP/HTTP style mutation, agent inspection, Yjs collaboration,
  persistence, component overrides, reload, and structured code handoff preserve
  the same fill stack.
- The Korean Inspector creates, edits, reorders, duplicates, hides, deletes, and
  switches fill paint types, including local image upload.
- Canvas rendering composes solid, linear/radial gradient, and image fills with
  per-fill opacity and blend mode for frames, rectangles, paths, and text.
- SVG emits one scoped paint pass per fill. PDF emits ordered fill commands,
  gradient shadings, image patterns, alpha graphics states, and standard blend
  modes. PNG, JPEG, and WEBP downloads render from the same SVG contract.
- Penpot migration keeps image fills on their owning shapes, registers local
  assets, preserves ordered gradient geometry and blend metadata, and removes
  synthetic frame or rectangle image children.
- Legacy scalar fill writes deterministically reset an owned fill stack to one
  solid fill instead of leaving conflicting authorities.

## Failure Learning

The loop exposed and fixed these exact cases:

1. RED run `29234879563` showed one white SVG/PDF scalar pass instead of three
   owned solid/gradient/image fills.
2. Earlier migration expectations still asserted flattened `paint_sources`;
   focused server tests now assert first-class fills in persistence, agent
   inspection, and code handoff.
3. A Yjs peer fixture initialized competing document state instead of joining an
   empty peer; the regression now proves an ordered fill round trip.
4. Generic PDF graphics-state insertion moved mask alpha before the established
   clip-stream boundary. Fill and mask graphics states now keep separate command
   ordering, covered by both fill and clip artifact tests.
5. The editor reducer compared `strokes` but omitted `fills` from its no-op
   test, so a secondary fill image edit was discarded locally. A focused
   undo/redo test and the browser upload lifecycle now cover fill-only changes.
6. Raster proof initially covered only canvas pixels. The browser test now
   downloads PNG, JPEG, and WEBP and checks each format signature and payload.

No memory note was added because the misses are repository-specific and are
captured by focused regressions, this delta, the completed plan, and PR #281.

## Verification

- Full Verification `29239015361`: maturity/design gates, typecheck, web build,
  all core suites, Rust workspace, and Playwright CLI passed.
- Web: 33 files and 250 tests passed. Server: 32 files and 252 tests passed.
  Collaboration: 33 tests passed.
- Playwright: 189 passed; one pre-existing component variant-authoring case was
  marked flaky after passing its retry. The new fill lifecycle passed.
- Storage Restore Drill `29239015644` and Storage Backup Retention
  `29239015484` passed.
- Direct browser actions edited a gradient, uploaded an image, sampled visible
  green/blue canvas pixels, blurred focus, ran undo/redo, reordered, duplicated,
  hid and deleted fills, downloaded SVG/PDF/PNG/JPEG/WEBP, polled persisted
  ownership, reloaded, and rechecked Inspector state.

Deployment remains non-gating. A Vercel preview eventually reached Ready after
an earlier free daily deployment-limit response, but this slice is accepted on
repository and Playwright product evidence.

## Exact Remaining Gap

Penpot imports and uses main components, linked copies, overrides, variants, and
variant switching as structural design-system concepts. Layo has a native
component system, but Penpot migration still does not map those relationships.
The next plan adopts component/main-copy ownership, adapts Penpot variants to
Layo definitions and instances, preserves supported overrides, and deliberately
warns without partial writes when identity cannot be reconstructed.
