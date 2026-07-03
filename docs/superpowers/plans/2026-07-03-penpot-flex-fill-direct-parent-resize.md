# Penpot Flex Fill Direct Parent Resize

## Objective

Close the next direct resizing-semantics evidence gap for Penpot-like flex layout: a width fill-sized child inside a fixed-width horizontal auto-layout frame must recalculate after the parent is resized through the live canvas selection handle, not only after Inspector numeric input.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot flexible layouts expose resize, fill, and fit behavior so content and containers adapt automatically.
- Decision: Adapt. Layo keeps its local-first `layout_item.width_sizing = "fill"` contract and proves the browser editor's direct canvas parent resize path recomputes fill width.
- Maturity gate: Layout maturity.

## Implementation

This loop starts as a verification-first slice. The initial change adds `apps/web/e2e/flex-fill-direct-parent-resize.spec.ts` and includes it in `pnpm test:e2e`.

The Playwright CLI flow:

- creates a project,
- sets the landing frame to horizontal auto layout with width `360`, height `180`, padding `20`, and gap `10`,
- sets the headline child to `layout_item.width_sizing = "fill"`,
- adds a fixed rectangle sibling with width `80`,
- verifies the fill child is `230` wide and the fixed sibling is at `x=260`,
- selects the parent frame and drags `resize-handle-bottom-right` by `60px` on the live canvas,
- verifies the parent frame is `420` wide,
- verifies the fill child remains `fill` and becomes `290` wide,
- verifies the fixed sibling stays `80` wide and moves to `x=320`.

## Verification

- GREEN Full Verification #28640571010:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e` with `flex-fill-direct-parent-resize.spec.ts` included

The direct Playwright CLI interaction selected the parent frame, dragged `resize-handle-bottom-right` by `60px`, and verified the parent, fill child, and fixed sibling geometry through the Inspector.

## Remaining Gaps

- Additional direct-resize and constraint edge cases beyond this parent corner-handle width proof.
- Full Unicode vertical-orientation table fidelity and font-specific vertical glyph substitutions.
- Last-baseline groups, orthogonal writing-mode baseline groups, and font-specific baseline metrics.
- Deployment remains intentionally deferred for this loop per current priority.
