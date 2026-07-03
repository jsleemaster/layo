# Penpot Flex Fill Resize

## Objective

Close the next focused resizing-semantics evidence gap for Penpot-like flex layout: a fill-sized child inside a fixed-width auto-layout frame must recalculate its width when the parent width changes, while fixed siblings keep their size and move to the updated flow position.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot flexible layouts expose child sizing options including fixed, fill, and fit-content behavior.
- Decision: Adapt. Layo keeps its local-first `layout_item.width_sizing = "fill"` contract and proves the browser editor recomputes fill size after parent resizing.
- Maturity gate: Layout maturity.

## Implementation Plan

1. Add focused Playwright CLI coverage for a horizontal auto-layout frame with padding, gap, one fill child, and one fixed child.
2. Resize the parent width through the live editor Inspector.
3. Verify the fill child remains `fill`, recalculates from `230` to `290`, and the fixed sibling moves from `x=260` to `x=320` while staying `80` wide.
4. If the proof fails, fix the smallest layout-state path that prevents recomputation.
5. Record the final verification and remaining gaps.

## Verification

Pending.

## Remaining Gaps

Pending verification.
