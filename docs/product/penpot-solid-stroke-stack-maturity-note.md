# Penpot Solid Stroke Stack Maturity Note

Last checked: 2026-07-05

## Decision

Layo adapts Penpot solid `strokes` stacks into the current single Layo stroke
style by flattening the ordered solid paint records into one deterministic
`style.stroke` color and opacity.

This is an intentional adaptation rather than exact Penpot paint-stack fidelity.
The current Layo document model still has a single primary stroke color/width
path, so preserving the visible composite and outer stroke extent is the
smallest product-aligned slice that keeps imported Penpot files inspectable,
editable, and testable.

## Landed Evidence

`2026-07-05-penpot-solid-multi-stroke-flattening.md` closes the same-width solid
stroke stack slice:

- RED Full Verification #28722912062 failed because the importer kept only
  `#ff0000` instead of flattening red-over-blue into `#800080`.
- GREEN Full Verification #28722958842 passed after the server mapper, HTTP
  persistence, and Playwright CLI import flow used the flattened stroke color.
- Final docs/head Full Verification #28723174583 passed after the plan evidence
  was recorded.
- Storage Restore Drill #28723174585 and Storage Backup Retention #28723174586
  passed for the same head.
- PR #231 was squash-merged as
  `ca7e91fac6d934ca2c6bce6df563111630d1b542`.

`2026-07-05-penpot-different-width-stroke-stack.md` closes the different-width
solid stroke stack slice:

- RED Full Verification #28723902377 failed because the importer read the first
  Penpot stroke record width, importing `stroke_width: 2` instead of preserving
  the widest visible stroke extent, 8.
- GREEN Full Verification #28724082389 passed after the importer selected the
  maximum valid width from the Penpot `strokes` stack while keeping the existing
  flattened stroke color behavior.
- The server unit fixture, HTTP persistence assertion, and Playwright CLI import
  flow now cover the `Wide layered stroke card` case.

## Remaining Import Gaps

These Penpot import/export maturity gaps remain open:

- stroke images and image-backed stroke records
- mixed solid and gradient stroke stacks beyond midpoint flattening
- exact gradient angle/radius fidelity
- exact paint compositing for blend modes and masks
- stroke alignment, caps, joins, dashes, and independent per-paint stroke bands
- path, SVG raw shape, component, variant, token, and shared-library relations
- exact multi-paint preservation if Layo later adds first-class paint stacks

Deployment remains intentionally deferred for this loop.
