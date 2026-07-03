# Penpot Flex Fill Height Resize

## Objective

Close the next focused resizing-semantics evidence gap for Penpot-like flex layout: a height fill-sized child inside a fixed-height vertical auto-layout frame must recalculate its height when the parent height changes, while fixed siblings keep their size and move to the updated flow position.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot flexible layouts expose child sizing options including fixed, fill, and fit-content behavior for width and height.
- Decision: Adapt. Layo keeps its local-first `layout_item.height_sizing = "fill"` contract and proves the browser editor recomputes fill height after parent resizing.
- Maturity gate: Layout maturity.

## Implementation

No production code change was needed in this loop. The existing normalized auto-layout solver already recalculates height-fill children when a fixed-height vertical parent changes.

This proof adds `apps/web/e2e/flex-fill-height-resize.spec.ts` and includes it in `pnpm test:e2e`. The Playwright CLI flow:

- creates a project,
- sets the landing frame to vertical auto layout with height `260`, padding `20`, and gap `10`,
- sets the headline child to `layout_item.height_sizing = "fill"`,
- adds a fixed rectangle sibling with height `80`,
- verifies the fill child is `130` high and the fixed sibling is at `y=160`,
- resizes the parent frame height to `320`,
- verifies the fill child remains `fill` and becomes `190` high,
- verifies the fixed sibling stays `80` high and moves to `y=220`.

## Verification

- GREEN Full Verification #28639404299:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e` with the new `flex-fill-height-resize.spec.ts` included

## Remaining Gaps

- Deeper direct-resize and constraint edge cases beyond Inspector-driven parent width/height resize proofs.
- Full Unicode vertical-orientation table fidelity and font-specific vertical glyph substitutions.
- Last-baseline groups, orthogonal writing-mode baseline groups, and font-specific baseline metrics.
- Deployment remains intentionally deferred for this loop per current priority.
