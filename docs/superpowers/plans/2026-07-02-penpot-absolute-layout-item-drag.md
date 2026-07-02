# Penpot Absolute Layout Item Drag

## Objective

Close the next Penpot layout maturity gap exposed after spacing handles: an absolute child inside an auto-layout frame must stay out of flow while remaining directly selectable and draggable on the canvas.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot flexible-layout elements support static and absolute positioning. Static elements remain in the flex flow; absolute elements are excluded from the flow and can be freely positioned in the layout.
- Decision: Adapt. Layo keeps local-first document semantics and deterministic editor state, but selected absolute layout items should behave like freely positioned canvas objects while preserving the saved `layout_item.position = "absolute"` contract.
- Maturity gate: Layout maturity.

## Failure Learning

- RED #28593647957: the first e2e fixture used a text layer, so the failed handle assertion did not isolate the absolute-layout rectangle behavior.
- RED #28594202807: the corrected rectangle fixture reproduced the product gap. A selected absolute child inside an auto-layout frame did not expose selection resize-handle geometry, so the Playwright drag helper could not compute a visible selected-object center.
- Root cause: `nodeGeometryInTree` returned `null` for any selected node whose parent had normalized auto/grid flow layout. That guard was correct for static flow children, but too broad for `layout_item.position = "absolute"`, which Penpot treats as out-of-flow and freely positioned.

No memory note was added because the failure was a product behavior gap found by the Penpot maturity loop rather than a new agent process rule. The durable project evidence is this plan, focused unit coverage, focused e2e coverage, benchmark update, and PR body notes.

## Implementation

- Added `apps/web/src/editor-state.absolute-layout.test.ts` to prove absolute auto-layout children expose document-space selection bounds, move with `moveSelectedNodesBy`, keep their absolute transform, and do not disturb a static flow sibling.
- Changed `apps/web/src/editor-state.ts` so flow-parent selection geometry excludes only static layout children. Absolute layout items now remain eligible for selection bounds, drag geometry, resize handles, and direct movement.
- Added `apps/web/e2e/absolute-layout-item.spec.ts` and included it in `pnpm test:e2e` to prove the visible editor flow:
  - create a project,
  - set the landing frame to vertical auto layout,
  - set one existing child to absolute,
  - create a rectangle child,
  - set that rectangle to absolute at `80,80`,
  - drag the selected rectangle on the canvas by `32,24`,
  - verify it remains absolute at `112,104`,
  - add a new static rectangle and verify it lands at the flow origin `20,20`.

## Verification

- GREEN Full Verification #28596128509:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e` with 153 Playwright CLI tests passing
- Storage Restore Drill #28596640216 passed.
- Storage Backup Retention #28596640320 passed.

## Remaining Gaps

- Broader grid absolute-positioning direct manipulation proof.
- Deeper resizing semantics for layout items.
- Deployment remains intentionally deferred for this loop per current priority.
