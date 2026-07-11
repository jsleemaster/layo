# Penpot Path Flattening Delta

Last checked: 2026-07-11

## Penpot reference

Penpot exposes Flatten alongside boolean operations as the destructive way to permanently combine paths into one path. Layo adopts that product behavior for closed first-class paths and non-destructive boolean results while adapting it to local-first agent control with dry-run/apply and reversible editor history.

References:

- https://help.penpot.app/user-guide/designing/layers/
- https://help.penpot.app/user-guide/first-steps/shortcuts/

## Closed gap

- Paper.js-backed `flattenPathGeometry` converts one or more closed path operands into normalized standalone local path data.
- Curves, even-odd holes, rotations, compound sources, world-space bounds, fill style, and deterministic ordering are preserved.
- `flatten_path` uses one MCP/HTTP command schema and supports dry-run and persisted apply.
- Destructive replacement happens only after all source geometry evaluates successfully.
- Boolean relation metadata and source children are removed from the persisted standalone path.
- The web editor exposes Korean-first `경로 평탄화` and `Ctrl/Cmd+E`.
- Editor history restores the full boolean relationship and source children on undo and reapplies the standalone path on redo.
- Playwright CLI verifies dry-run isolation, direct control, persistence, reload, and flattened SVG/PDF/PNG downloads.

## Failure learning

- RED Full Verification run `29150104717` failed at Typecheck because the flatten evaluator did not exist.
- Run `29150134360` exposed an invalid rotation test: rotating a circle cannot change its bounds.
- Run `29150262125` exposed a second geometry expectation error: a rotated ellipse uses projected semi-axis bounds, not a rectangle diagonal shortcut.
- Run `29150314818` passed 184 existing E2E tests and failed only because the new test read `persisted` at the response root instead of `result.persisted`.
- GREEN code-head Full Verification run `29150553848` passed maturity/design gates, typecheck, web build, Core tests, and all 185 Playwright tests before final history/artifact documentation additions.

## Remaining gap

Open paths remain rejected before destructive replacement. The next exact path-maturity goal is Penpot-comparable open-path flattening that preserves stroke width, dash/style, caps, joins, and arrow/marker semantics across canvas and SVG/PDF/PNG output without inventing fill geometry.
