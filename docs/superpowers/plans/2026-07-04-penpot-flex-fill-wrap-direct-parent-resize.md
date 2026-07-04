# Penpot Wrapped Fill Direct Parent Resize

**Goal:** Close the next Penpot-class flexible-layout resizing edge case by
proving wrapped horizontal auto-layout fill children recompute before line
breaking when a parent is resized directly on the canvas.

**Penpot reference:** Penpot Flexible Layouts:
https://help.penpot.app/user-guide/designing/flexible-layouts/

**Maturity gate:** Layout maturity in
`docs/product/penpot-maturity-benchmark.md`.

## Gap

Recent Layo evidence proved single-line horizontal and vertical fill children
recompute after fixed parent resizing, including direct browser canvas parent
resize. A remaining edge case existed for wrapped horizontal auto-layout: line
breaking could use the fill child's stale previous rendered width before the
fill width was recomputed for the resized parent.

That meant a parent shrink from 420px to 360px could treat a previous 290px fill
child as too wide to share a row with an 80px fixed sibling, even though the
correct recomputed fill width is 230px and both children still fit in the same
row.

## RED Evidence

- Full Verification #28709960636 failed first because the new unit fixture used
  fields outside the current renderer contract. That was a test fixture issue,
  not the product failure.
- Full Verification #28710000500 then reproduced the real product failure in
  `apps/web/src/flex-wrap-fill-resize.test.ts`: expected the fill child width to
  be 230 after direct parent resize, but it stayed 320 because wrapped line
  construction used the stale fill width.

## Implementation

- Added focused web editor-state coverage for the document-model behavior.
- Added focused server storage/agent-command coverage for the deterministic
  saved-file path.
- Added Playwright CLI e2e coverage and wired it into root `test:e2e` so direct
  canvas resizing verifies the live editor behavior.
- Updated web and server layout line construction to measure fill main-axis
  children by their minimum line-break contribution, not their stale current
  rendered size. The existing fill sizing pass still computes the final width
  after the line is chosen.

## Verification

- RED Full Verification #28710000500: core tests failed with expected 230 vs
  received 320 in `apps/web/src/flex-wrap-fill-resize.test.ts`.
- GREEN Full Verification #28710162544: passed maturity/design gates,
  typecheck, web build, core tests, and Playwright CLI e2e.

## Direct UI Proof

`apps/web/e2e/flex-fill-wrap-direct-parent-resize.spec.ts` creates a wrapped
horizontal auto-layout frame, sets the headline to width `fill`, adds an 80px
fixed sibling, then drags the selected parent bottom-right resize handle from
420px to 360px wide. The visible Inspector result is:

- fill child remains `fill`, stays at `x = 20`, `y = 20`, and recomputes from
  290px to 230px wide.
- fixed sibling stays on the same row at `y = 20` and moves from `x = 320` to
  `x = 260`.

## Remaining Risks

This closes one wrapped direct-resize fill edge case. Deeper layout risks still
include full Unicode vertical-orientation table fidelity, font-specific vertical
glyph substitutions, last-baseline groups, orthogonal writing-mode baseline
groups, font-specific baseline metrics, and other direct-resize/constraint edge
cases not covered by this proof.
