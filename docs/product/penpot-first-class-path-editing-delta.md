# Penpot First-Class Path Editing Delta

Date: 2026-07-10
Status: First-class path foundation and direct anchor editing verified on PR #272; advanced topology remains active

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

## Remaining Completion Gates

- Add/delete anchors and corner/curve conversion remain the next exact failed capability.
- Join, merge, separate, and move-mode keyboard commands still need focused unit and Playwright proof.
- Add explicit redo persistence coverage and a Bezier-handle browser drag fixture.
- Follow with a separate non-destructive union/difference/intersection/exclusion plan after path topology editing is complete.
