# Penpot First-Class Stroke Paints Delta

Last checked: 2026-07-13

## Decision

Adopt Penpot's per-stroke solid, gradient, and image paint ownership. Adapt
image references to Layo's local asset store and deterministic HTTP/MCP export
contracts. Keep `NodeStroke.color` only as a legacy solid fallback; do not keep
gradient or image stroke ownership in parallel `paint_sources` metadata.

References:

- https://help.penpot.app/user-guide/designing/color-stroke/
- https://github.com/penpot/penpot

## Landed Product Behavior

- Renderer, storage, and Rust models expose one tagged `NodeStroke.paint`
  contract for solid, gradient, and image sources.
- Agent style mutation validates paint ownership, gradient stops and geometry,
  image asset ids, and legacy solid fallback synchronization.
- Yjs collaboration, component overrides, persistence, reload, and code handoff
  preserve ordered paint payloads without flattening.
- The Korean Inspector selects solid/gradient/image paint, edits gradient end
  colors, uploads local image assets, and preserves duplicate history.
- Canvas rendering supports linear and radial gradients, elliptical radial
  width, image patterns, open/closed path alignment, box alignment, opacity,
  visibility, order, and dash behavior.
- SVG emits scoped gradient or image pattern definitions per stroke. PDF emits
  ordered solid commands, gradient shading resources, and image tiling patterns.
- Penpot migration attaches gradient/image paint to the original rectangle or
  frame stroke, preserves gradient points and custom dash arrays, registers
  image assets, and stops manufacturing stroke-image child layers.
- The root Playwright suite covers Inspector editing, visible gradient pixels,
  image upload, undo/redo, SVG/PDF downloads, persistence, and reload.

## Failure Learning

The loop exposed and fixed these cases:

1. RED Full Verification `29228755403` proved that SVG and PDF rendered all
   ordered paints through the solid fallback.
2. A broad Rust insertion anchor initially placed `paint` on
   `NodePaintStop`; diff review moved it to `NodeStroke`.
3. The first Inspector gradient default used a raw blue literal and failed the
   design rule gate; it now derives from the selected node.
4. A duplicate gradient helper name failed typecheck; the implementation now
   reuses the existing stop-color helper.
5. The first Yjs test synchronized only one initial direction and failed for the
   test setup rather than paint ownership; it now initializes both replicas
   consistently before applying the mutation.
6. Legacy import tests still asserted flattened gradients and generated image
   layers. Unit and Playwright expectations now assert first-class ownership.
7. Review found Penpot custom dash arrays were discarded, radial `width` was
   ignored on canvas, and malformed solid payloads could throw before contract
   validation. Focused fixes and regressions cover all three.
8. Full Verification `29230868035` exposed seven browser failures: five stale
   migration expectations, one radial sample taken between thick stroke
   centerlines, and one undo shortcut consumed by an active Inspector input.
9. Full Verification `29231851335` passed all repaired legacy paths and left
   only the active-input undo case. The final test blurs the actual active
   editor before dispatching the global shortcut.

No memory note was added because these misses are repository-specific and the
durable failure-loop rule, focused regressions, delta, plan status, and PR body
already govern future work.

## Verification

Code-head evidence:

- Full Verification `29232502532`: maturity/design gates, typecheck, web
  build, Core tests, and all 189 Playwright cases passed in 6.8 minutes.
- Storage Restore Drill `29232502537`: passed.
- Storage Backup Retention `29232502595`: passed.
- Focused evidence includes
  `agent-control-stroke-paints.test.ts`,
  `node-artifacts-stroke-paints.test.ts`,
  Penpot stroke migration tests, Yjs preservation, code export, and
  `stroke-paints.spec.ts`.
- Direct Playwright actions changed gradient colors, uploaded an image paint,
  inspected visible green/blue canvas pixels, blurred the active editor,
  performed undo/redo, downloaded SVG/PDF artifacts, polled persisted paint
  ownership, reloaded, and rechecked Inspector state.

A final documentation-head Full Verification remains the merge gate. Deployment
is deferred and non-gating because the Vercel account reached
`api-deployments-free-per-day`.

## Exact Remaining Gap

Penpot also lets each fill layer own solid, gradient, or image paint in an
ordered stack. Layo still flattens imported fill stacks into one scalar fill or
manufactures image children. The next plan applies the same authoritative,
ordered paint ownership to fills without regressing masks, blend metadata,
assets, artifacts, or deterministic agent control.
