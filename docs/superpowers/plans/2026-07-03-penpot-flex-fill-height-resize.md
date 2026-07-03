# Penpot Flex Fill Height Resize

## Objective

Close the next focused resizing-semantics evidence gap for Penpot-like flex layout: a height fill-sized child inside a fixed-height vertical auto-layout frame must recalculate its height when the parent height changes, while fixed siblings keep their size and move to the updated flow position.

## Penpot Reference

- Source: https://help.penpot.app/user-guide/designing/flexible-layouts/
- Capability: Penpot flexible layouts expose child sizing options including fixed, fill, and fit-content behavior for width and height.
- Decision: Adapt. Layo keeps its local-first `layout_item.height_sizing = "fill"` contract and proves the browser editor recomputes fill height after parent resizing.
- Maturity gate: Layout maturity.

## Implementation Plan

1. Add focused Playwright CLI coverage for a vertical auto-layout frame with padding, gap, one height-fill child, and one fixed child.
2. Resize the parent height through the live editor Inspector.
3. Verify the fill child remains `fill`, recalculates from `130` to `190`, and the fixed sibling moves from `y=160` to `y=220` while staying `80` high.
4. If the proof fails, fix the smallest layout-state path that prevents height recomputation.
5. Record the final verification and remaining gaps.

## Verification

Pending.

## Remaining Gaps

Pending verification.
