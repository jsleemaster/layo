# Penpot Flex Fill Direct Parent Height Resize

## Objective

Close the next direct resizing-semantics evidence gap for Penpot-like flex layout: a height fill-sized child inside a fixed-height vertical auto-layout frame must recalculate after the parent is resized through the live canvas selection handle, not only after Inspector numeric input.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot flexible layouts expose resize, fill, and fit behavior so content and containers adapt automatically.
- Decision: Adapt. Layo keeps its local-first `layout_item.height_sizing = "fill"` contract and proves the browser editor's direct canvas parent resize path recomputes fill height.
- Maturity gate: Layout maturity.

## Implementation

This loop starts as a verification-first slice. The initial change adds `apps/web/e2e/flex-fill-direct-parent-height-resize.spec.ts`, which is included by the existing Playwright e2e glob.

The Playwright CLI flow:

- creates a project,
- sets the landing frame to vertical auto layout with width `220`, height `260`, padding `20`, and gap `10`,
- sets the headline child to `layout_item.height_sizing = "fill"`,
- adds a fixed rectangle sibling with height `80`,
- verifies the fill child is `130` high and the fixed sibling is at `y=160`,
- selects the parent frame and drags `resize-handle-bottom-right` by `60px` vertically on the live canvas,
- verifies the parent frame is `320` high,
- verifies the fill child remains `fill` and becomes `190` high,
- verifies the fixed sibling stays `80` high and moves to `y=220`.

## Verification

- GREEN Full Verification #28699572692:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e` with `flex-fill-direct-parent-height-resize.spec.ts` included

The direct Playwright CLI interaction selected the parent frame, dragged `resize-handle-bottom-right` by `60px` vertically, and verified the parent, fill child, and fixed sibling geometry through the Inspector.

## Remaining Gaps

- Additional direct-resize and constraint edge cases beyond this parent corner-handle height proof.
- Full Unicode vertical-orientation table fidelity and font-specific vertical glyph substitutions.
- Last-baseline groups, orthogonal writing-mode baseline groups, and font-specific baseline metrics.
- Deployment remains intentionally deferred for this loop per current priority.
