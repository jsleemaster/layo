# Penpot Grid Absolute Layout Item Drag

## Objective

Close the remaining evidence gap for Penpot-like grid absolute positioning: an absolute child inside a grid frame must stay out of grid flow while remaining directly selectable and draggable on the canvas.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot Grid element properties include `Position: static, absolute`, and grid elements can be placed by dragging in the layout viewport.
- Decision: Adapt. Layo keeps its local-first `layout_item.position = "absolute"` document contract and proves the existing direct selection/drag behavior against grid layout parents.
- Maturity gate: Layout maturity.

## Implementation

No production code change was needed in this loop. The previous absolute layout-item selection geometry fix applies to both normalized auto and grid layout parents because it excludes only static flow children from selection geometry.

This proof adds `apps/web/e2e/grid-absolute-layout-item.spec.ts` and includes it in `pnpm test:e2e`. The Playwright CLI flow:

- creates a project,
- sets the landing frame to 2x2 grid layout with explicit padding and gaps,
- sets the headline child to `layout_item.position = "absolute"` at `90,70`,
- drags the selected absolute child on the canvas by `32,24`,
- verifies it remains absolute at `122,94`,
- creates a new rectangle child,
- verifies the new static child auto-places at the grid flow origin `24,20`,
- reselects the headline and verifies the absolute position stayed stable.

## Verification

- GREEN Full Verification #28597550413:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e` with 154 Playwright CLI tests passing, including `grid-absolute-layout-item.spec.ts`

## Remaining Gaps

- Deeper layout resizing semantics.
- Full Unicode vertical-orientation table fidelity and font-specific vertical glyph substitutions.
- Last-baseline groups, orthogonal writing-mode baseline groups, and font-specific baseline metrics.
- Deployment remains intentionally deferred for this loop per current priority.
