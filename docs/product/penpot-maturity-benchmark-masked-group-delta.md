# Penpot Masked Group Benchmark Delta

Last checked: 2026-07-05

## Reference Capability

Penpot treats a masked group as a group shape with mask metadata and renders the result through SVG mask or clipPath definitions.

Sources:

- https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs

## Layo Decision

Decision: adapt.

Layo does not yet have a first-class clipping mask primitive. This slice preserves the group container and child layer structure during Penpot ZIP import, then emits an explicit warning that the masked group is imported as an unclipped Layo group.

## Maturity Gate

Import/export maturity.

The closed gap is structural data loss: a Penpot masked group should not cause its visible child layers to be skipped. The remaining gap is visual mask fidelity: Layo still needs a document-level clipping or mask model before it can match Penpot's rendered mask behavior.

## Evidence

- RED Full Verification #28729630728 failed because a Penpot masked group imported with `mappedNodeCount: 0`, `skippedNodeCount: 1`, and `Skipped unsupported Penpot shape type group (Masked artwork).`
- GREEN Full Verification #28729944594 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.
- The new browser-visible import proof ran as `[159/177] apps/web/e2e/external-migration-penpot-masked-group.spec.ts` and the Playwright result was `177 passed (5.7m)`.
- Storage Restore Drill #28729944610 and Storage Backup Retention #28729944607 passed for the same implementation head.

## Next Gap

First-class mask/clipping semantics remain open. A future Penpot maturity-loop goal should start from a concrete Penpot masked group fixture whose expected visible output requires clipping, then add the document model, renderer, export, HTTP/MCP inspection, and Playwright visual proof needed to preserve that behavior.

## Deployment

Deployment remains intentionally deferred for this slice.
