# Penpot First-Class Multi-Stroke Delta

## Benchmark decision

Adopt Penpot's ordered stroke product model. Layo now treats `style.strokes`
as the authoritative stack when present. Legacy `stroke` fields remain migration
and compatibility inputs rather than a substitute for the stack.

Reference:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Closed gap

PR #278 adds:

- Rust, renderer, server-storage, editor, and generated handoff contracts for
  ordered stroke layers.
- Per-stroke id, color, opacity, width, position, style, visibility, dash
  pattern, cap, join, and open-path endpoints.
- Deterministic `set_node_style` validation with duplicate-id and invalid-value
  rejection, dry-run/apply persistence, history, reload, Yjs object-map
  collaboration preservation, and component-instance override serialization.
- Korean Inspector workflows for add, reorder, duplicate, hide/show, delete,
  color, width, opacity, position, and style.
- Separate Konva, SVG, and PDF paint passes, per-stroke SVG marker resources,
  PDF transparency resources, stable paint order, and hidden-layer exclusion.
- Box-shape inside/center/outside geometry and raster export bounds that preserve
  outside strokes in PNG output.
- Ordered stroke metadata in code-export structures, annotations, and generated
  modules.

## Failure learning

The loop exposed and fixed these cases:

1. RED Full Verification `29222756407` failed because `strokes` did not exist
   in the renderer contract.
2. The first artifact implementation expanded legacy box bounds and shifted
   existing PDF gradient coordinates. Legacy bounds now remain unchanged while
   first-class stacks opt into aligned bounds.
3. The Inspector default color violated the raw-color design gate. New layers
   derive color from the selected node.
4. Component overrides initially assumed scalar style values. Stroke stacks are
   serialized and restored explicitly.
5. The new Playwright spec was not registered in root `test:e2e`; the coverage
   guard caught and fixed the omission.
6. The first lifecycle expectation deleted the outer stroke instead of the
   duplicate. The test now targets the duplicated row.
7. Canvas initially painted the compatibility stroke and stack together. The
   base shape now paints fill only when `strokes` is present.
8. PNG bounds and undo/redo were missing from the first proof. The final E2E
   downloads the selected PNG, checks expanded dimensions, performs undo/redo,
   verifies ordered persistence, and reloads the result.
9. Empty dotted/dashed patterns differed between canvas and vector artifacts.
   Shared style defaults now produce deterministic dash patterns.

No memory note was added because these misses are feature-local and the durable
process rules already require RED capture, E2E registration, visual proof, and
failure documentation.

## Verification

Final code-head evidence:

- Full Verification `29224618439`: Penpot maturity/design gates, typecheck,
  web build, Core tests, and all 187 Playwright cases passed.
- Storage Restore Drill `29224618444`: passed.
- Storage Backup Retention `29224618447`: passed.
- Focused unit evidence:
  `node-artifacts-multi-stroke.test.ts`,
  `agent-control-multi-stroke.test.ts`, and
  `code-export-multi-stroke.test.ts`.
- Direct browser evidence:
  `multi-stroke.spec.ts` adds, reorders, duplicates, hides, deletes, changes
  position/opacity, performs undo/redo, downloads a non-cropped PNG, observes
  row/value changes, verifies persisted order, and reloads the same state.

A final documentation-head Full Verification remains the merge gate.

## Exact remaining gap

Box-shape alignment is first-class, but closed curved path inside/outside
alignment still needs geometry-aware offset/clip behavior across canvas, SVG,
PDF, and PNG. Open paths keep center alignment because inside/outside is
undefined for an unclosed contour. That exact closed-path case is routed to
`2026-07-13-penpot-closed-path-stroke-alignment.md`.

Deployment remains deferred and non-gating.
