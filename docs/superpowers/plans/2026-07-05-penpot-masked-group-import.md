# Penpot Masked Group Import

## Goal

Adapt the next Penpot import/export maturity gap: Penpot masked groups should not be skipped during ZIP import.

## Penpot Reference

- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- Source: https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs
- Reference capability: Penpot represents masks as group shapes marked as masked groups and renders them through SVG mask/clipPath definitions.
- Decision: adapt. Layo does not yet have a first-class clipping mask primitive, so this slice preserves the group container and child layer structure while warning that clipping is not preserved.
- Maturity gate: import/export.

## Failure Mode

Before this slice, `mapPenpotShape` allowed `frame`, `rect`, `text`, `image`, `svg-raw`, and `path`. A Penpot masked group arrived as a `group` shape, so the importer treated it as unsupported and skipped the group plus its visible children.

## RED Evidence

Full Verification #28729630728 failed in Core tests on PR #240:

- `apps/server/src/external-migration.penpot-masked-group.test.ts` expected `mappedNodeCount: 2` and `skippedNodeCount: 0`, but the importer returned `mappedNodeCount: 0` and `skippedNodeCount: 1`.
- The HTTP persistence case expected the explicit masked-group warning, but the importer warned `Skipped unsupported Penpot shape type group (Masked artwork).`
- Playwright CLI e2e was skipped after the Core tests failed.

## Implementation

- Adds `group` to the supported Penpot shape set.
- Maps Penpot `group` shapes to Layo `group` nodes with preserved bounds, transform, opacity, and child traversal.
- Detects `maskedGroup` / `masked-group` flags and records an explicit warning that the import is unclipped.
- Keeps child rectangle mapping intact so visible artwork structure is preserved for follow-up mask fidelity work.

## GREEN Evidence

Full Verification #28729944594, job #85193778009, passed:

- Penpot maturity and design rule gates.
- Typecheck.
- Web build.
- Core tests.
- Playwright CLI e2e.

The new e2e spec ran at `[159/177]` as `apps/web/e2e/external-migration-penpot-masked-group.spec.ts`, and the final e2e result was `177 passed (5.7m)`.

Storage Restore Drill #28729944610 and Storage Backup Retention #28729944607 both passed for head `a5d9804e3fe90d2aa26f8beac900e01368aed8cf`.

## Remaining Divergence

Imported masked groups are structurally portable but not clipped. Future Penpot maturity slices still need first-class mask/clipping semantics, editable vector/path geometry, components, variants, tokens, and library relations.

## Deployment

Deployment is intentionally deferred. It is not the acceptance gate for this maturity slice.
