# Penpot Closed-Path Stroke Alignment Delta

Last checked: 2026-07-13

## Decision

Adopt Penpot's inside, center, and outside stroke semantics for closed shapes.
Adapt the implementation to Layo's deterministic local-first architecture by
clipping doubled stroke paint passes against the authoritative path. Deliberately
normalize inside/outside requests on open paths to center because they do not
enclose an area.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Landed Product Behavior

- One shared `pathHasOnlyClosedSubpaths` contract classifies cubic, compound,
  even-odd, and mixed open/closed topology.
- Canvas rendering uses Path2D interior or inverse-area clipping and preserves
  ordered color, opacity, dash, cap, join, and paint order.
- SVG exports generate scoped clip-path and mask definitions with doubled stroke
  widths and the path's fill rule.
- PDF exports use original path operators, doubled widths, and nonzero/even-odd
  clipping instead of substituting inset rectangles.
- PNG bounds include outside alignment.
- MCP/HTTP `set_node_style` normalizes unsupported open-path alignment to
  center; renderers also defend older unnormalized documents.
- The Korean Inspector shows effective center alignment for open paths, disables
  unsupported choices, and preserves closed-path undo/redo and reload behavior.

## Verification

- RED Full Verification `29225628767`: SVG clip/mask, PDF aligned paint, and
  open-path normalization contracts all failed before implementation.
- GREEN Full Verification `29227360608`: maturity/design gates, typecheck,
  build, unit tests, Rust tests, and 188 Playwright cases passed.
- Storage Restore Drill `29227360595`: passed.
- Storage Backup Retention `29227360638`: passed.
- Direct Playwright interaction selected closed and open path layers, inspected
  effective alignment controls, measured distinct red outside and blue inside
  canvas pixel bounds, exported an expanded PNG, changed alignment, performed
  undo/redo, reloaded, and verified the visible disabled open-path choices.

## Failure Learning

The loop corrected five concrete misses:

1. Existing clip helpers read frame clip-source fill rules instead of path fill
   rules; path-specific SVG/PDF clip operators now preserve even-odd holes.
2. Remote large-file line chunks were joined without durable boundary
   preservation; full source reconstruction and length checks restored App and
   artifact files before verification.
3. TypeScript narrowing did not survive the Konva callback; narrowed path
   content is captured before the callback.
4. The new Playwright spec was initially absent from the root E2E registry; the
   registry gate now includes it.
5. Playwright's `toBeDisabled` did not model disabled `option` elements even
   when the DOM showed `disabled`; the regression test asserts the native DOM
   attribute.

No memory note was added because the durable repo failure-loop document, focused
tests, PR body, and plan evidence capture these repository-specific misses.

## Remaining Exact Gap

First-class `NodeStroke` entries still own only a solid `color`. Gradient and
image stroke paints exist on separate legacy/import surfaces, so ordered strokes
cannot independently own, edit, collaborate, persist, and export those paint
sources. The next plan adopts per-stroke paint-source ownership without
regressing solid strokes or local-first deterministic control.
