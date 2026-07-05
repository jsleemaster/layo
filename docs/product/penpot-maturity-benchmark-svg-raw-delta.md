# Penpot Maturity Benchmark Delta: SVG Raw Import

Date: 2026-07-05

## Reference

- Penpot source includes `:svg-raw` as a shape type.
- Penpot's SVG raw renderer treats `shape.content` as SVG root/elements/leaves.

## Decision

Adapt.

Layo should not skip Penpot `svg-raw` shapes during import. Because Layo does not yet have an editable raw SVG/vector subtree model, this slice preserves readable raw SVG as a local `image/svg+xml` asset and maps the imported shape to a deterministic image node.

## Closed Gap

Penpot ZIP import no longer drops readable `svg-raw` shapes.

Evidence:

- RED Full Verification #28728076290 failed because the importer mapped only the frame and skipped the `svg-raw` child.
- GREEN Full Verification #28728279896 passed with the new Playwright spec at `[162/175]` and `175 passed (5.7m)`.
- Storage Restore Drill #28728279895 and Storage Backup Retention #28728279907 passed for the same head.

## Remaining Benchmark Risk

The main benchmark's import/export gap should now treat `SVG raw shapes` as partially adapted for visual and asset portability. The remaining Penpot-comparable gap is editable vector/path/SVG semantics, plus masks, blend modes, components, variants, tokens, and library relations.

Deployment remains intentionally deferred.
