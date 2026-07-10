# Penpot First-Class Path Editing Delta

Date: 2026-07-10
Status: In progress on PR #272

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

## Failure Loop Evidence

- RED import: Full Verification #424, run `29081308006`, received `kind: "image"` and placeholder image style instead of the expected first-class path.
- GREEN import/model baseline: Full Verification #433, run `29081887657`.
- RED MCP mutation: Full Verification #435, run `29082394587`, MCP rejected `set_path_data`.
- GREEN MCP mutation: Full Verification #436, run `29082543002`.
- RED artifacts: Full Verification #438, run `29083054678`, SVG emitted a rectangle instead of path geometry.
- GREEN canvas/artifacts/pixels: Full Verification #443, run `29084105892`.\n- RED direct editing: Full Verification #447, run `29084575601`, passed 182 Playwright cases and failed only because selecting a path and pressing Enter did not create `path-editor-overlay`.

## Remaining Completion Gates

- Add an explicit Rust JSON round-trip regression for path content.
- Parse path data into editable anchors and control handles.
- Support direct anchor/control dragging and node add/delete/corner/curve/join/merge/separate commands.
- Persist completed interactions through `set_path_data` with one undo entry per interaction.
- Verify keyboard focus, undo/redo, geometry persistence, and visible changes through dedicated Playwright CLI interaction coverage.
- Follow with a separate non-destructive boolean path operations plan after direct path editing is complete.
