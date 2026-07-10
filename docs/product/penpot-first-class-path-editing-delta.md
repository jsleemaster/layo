# Penpot First-Class Path Editing Delta

Date: 2026-07-10
Status: Complete across PR #272 and PR #273

## Penpot Reference

- Path and Bezier node editing: https://help.penpot.app/user-guide/designing/layers/
- Open-source product and data model: https://github.com/penpot/penpot
- Current Penpot behavior includes path drawing, node and handle editing, keyboard path commands, and non-destructive boolean operations.

## Layo Decision

Adopt first-class editable path nodes. Layo adapts persistence through its Rust-owned local document model and deterministic HTTP/MCP command batches. The previous path-as-SVG-image bridge remains readable for backward compatibility but is no longer the target for new Penpot path imports.

## Landed On The Draft Branch

- Rust and generated TypeScript contracts now include `NodeKind::Path` / `kind: "path"`.
- Path content persists `path_data` and `fill_rule`.
- Penpot path imports preserve source fill, stroke, width, opacity, bounds, geometry, and winding semantics without synthesizing SVG assets.
- `set_path_data` supports deterministic MCP/HTTP dry-run and apply through the existing validation and change-summary transaction.
- Agent inspect exposes `pathData` and `fillRule`.
- The browser canvas renders first-class paths through `Konva.Path`.
- SVG and PDF artifacts emit path geometry and even-odd fill operators directly from first-class content.
- Playwright checks visible canvas pixels for an imported even-odd path.
- The browser enters path editing by double-click or `Enter`, exposes keyboard-focusable anchors and Bezier handles, and exits with `Escape`.
- Completed anchor/control drags serialize through `set_path_data` as one editor command; undo persists the restored path data.
- Compound SVG paths preserve later `M` subpath commands instead of converting them to `L`.
- Path topology controls add and delete anchors, convert corners and curves, join and separate subpaths, and merge two selected anchors.
- Anchor insertion preserves line geometry and splits cubic/quadratic Bezier segments with De Casteljau subdivision.
- Explicit redo persistence and direct Bezier-handle dragging are covered in the browser workflow.

## Failure Loop Evidence

- RED import: Full Verification #424, run `29081308006`, received `kind: "image"` and placeholder image style instead of the expected first-class path.
- GREEN import/model baseline: Full Verification #433, run `29081887657`.
- RED MCP mutation: Full Verification #435, run `29082394587`, MCP rejected `set_path_data`.
- GREEN MCP mutation: Full Verification #436, run `29082543002`.
- RED artifacts: Full Verification #438, run `29083054678`, SVG emitted a rectangle instead of path geometry.
- GREEN canvas/artifacts/pixels: Full Verification #443, run `29084105892`.
- RED direct editing: Full Verification #447, run `29084575601`, passed 182 Playwright cases and failed only because selecting a path and pressing Enter did not create `path-editor-overlay`.
- Repair attempt: Full Verification #463, run `29085935775`, stopped at typecheck on one nullable path ID and two command-union narrowing errors.
- GREEN direct editing: Full Verification #465, run `29086037029`, attempt 2 passed Penpot maturity/design gates, typecheck, web build, core tests, and all 183 Playwright cases.
- Direct Playwright actions: select `Compound even odd path`, press `Enter`, verify eight focusable anchors, drag the first anchor by 12 x 8 screen pixels, poll persisted `path_data`, press `Control+z`, verify persisted restoration, and press `Escape`.
- RED topology semantics: Full Verification #474, run `29088078626`, exposed the incorrect raw `H/V` string-preservation assumption after semantic path normalization.
- GREEN topology baseline: Full Verification #475, run `29088716522`, passed all gates and Playwright cases after asserting normalized geometry.
- Review repair: Full Verification #477, run `29089270502`, failed typecheck while adding cubic/quadratic subdivision; the command union was narrowed explicitly.
- GREEN completed path editing: Full Verification #478, run `29089414317`, passed maturity/design gates, typecheck, web build, core tests, and full Playwright.

## Next Penpot Gap

First-class path editing is complete for this plan. The next active plan is `docs/superpowers/plans/2026-07-10-penpot-nondestructive-boolean-paths.md`: preserve editable source operands while evaluating union, difference, intersection, and exclusion through the same local-first document, agent, undo/redo, canvas, and artifact contracts.
