# Penpot Flex Fill Resize

## Objective

Close the next focused resizing-semantics evidence gap for Penpot-like flex layout: a fill-sized child inside a fixed-width auto-layout frame must recalculate its width when the parent width changes, while fixed siblings keep their size and move to the updated flow position.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot flexible layouts expose child sizing options including fixed, fill, and fit-content behavior.
- Decision: Adapt. Layo keeps its local-first `layout_item.width_sizing = "fill"` contract and proves the browser editor recomputes fill size after parent resizing.
- Maturity gate: Layout maturity.

## Implementation

No production code change was needed in this loop. The existing normalized auto-layout solver already recalculates fill-sized children when a fixed-size parent changes.

This proof adds `apps/web/e2e/flex-fill-resize.spec.ts` and includes it in `pnpm test:e2e`. The Playwright CLI flow:

- creates a project,
- sets the landing frame to horizontal auto layout with width `360`, padding `20`, and gap `10`,
- sets the headline child to `layout_item.width_sizing = "fill"`,
- adds a fixed rectangle sibling with width `80`,
- verifies the fill child is `230` wide and the fixed sibling is at `x=260`,
- resizes the parent frame width to `420`,
- verifies the fill child remains `fill` and becomes `290` wide,
- verifies the fixed sibling stays `80` wide and moves to `x=320`.

## Verification

- GREEN Full Verification #28638419563:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e` with the new `flex-fill-resize.spec.ts` included

## Remaining Gaps

- Deeper direct-resize and constraint edge cases beyond this parent-width Inspector resize proof.
- Full Unicode vertical-orientation table fidelity and font-specific vertical glyph substitutions.
- Last-baseline groups, orthogonal writing-mode baseline groups, and font-specific baseline metrics.
- Deployment remains intentionally deferred for this loop per current priority.
