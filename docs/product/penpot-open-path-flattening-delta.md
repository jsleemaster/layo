# Penpot Open Path Flattening Delta

## Benchmark decision

Layo adapts Penpot's open-path and stroke model while keeping deterministic local-first documents. Flatten preserves an explicit stroke contract instead of silently closing an open path or manufacturing a fill region.

References:

- https://help.penpot.app/user-guide/designing/layers/
- https://help.penpot.app/user-guide/designing/color-stroke/

## Landed product evidence

- Open line, cubic, and multi-subpath geometry can be flattened into one standalone open path.
- Fill stays transparent and stroke width, cap, join, dash array, start marker, end marker, and opacity survive MCP/HTTP dry-run and apply.
- Multi-source open Flatten is no-write when source stroke contracts differ.
- The web editor preserves the contract through history, persistence, reload, canvas rendering, and selected-layer PNG export.
- SVG emits visual cap, join, dash, and endpoint marker definitions.
- PDF emits visual cap, join, and dash operators. Endpoint marker names are retained as deterministic PDF comments, but marker geometry is not drawn yet.

## Failure learning

- The first RED run failed at typecheck because the document model did not contain the new stroke fields.
- A mechanical Rust model edit temporarily removed two `opacity` labels. The malformed literals were inspected and repaired before relying on CI.
- Two remote test edits introduced literal `\\n` text. The parse failures were fixed, and `PLAN_STATUS.md` was also repaired so rows remain canonical Markdown.
- Paper.js reports an implicit area for open compound paths. Regression coverage now checks the explicit `closed: false` contract and absence of `Z`, not Paper's area value.
- The cubic fixture's actual centerline extrema produce height `14.434`; the doubled expectation was corrected.
- Adding implicit SVG cap/join defaults changed unrelated exact artifacts. SVG now emits those attributes only when the style explicitly owns them.

## Verification

Full Verification run is recorded in `PLAN_STATUS.md` after the final PR-head gate. The focused browser case covers the Korean `경로 평탄화` control, persistence, reload, visible stroke pixels, and PNG bytes.

## Next exact gap

PDF endpoint markers are not yet visual geometry, and marker/stroke-aware selected-layer export bounds plus first-class human stroke controls still need product evidence. The next loop must start from those exact cases rather than treating metadata comments as Penpot parity.
