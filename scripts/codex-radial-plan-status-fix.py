from pathlib import Path

path = Path("docs/superpowers/PLAN_STATUS.md")
status = path.read_text(encoding="utf-8")
row = "| `2026-07-06-penpot-radial-gradient-svg-artifact.md` | Completed | Adapts preserved Penpot radial fill paint-source metadata to emit selected-layer SVG `<radialGradient>` paint servers for supported simple circular non-text, non-group nodes while keeping deterministic `data-fallback-fill` and leaving PDF/raster/canvas radial parity as follow-up work. The regression is `apps/web/src/node-artifacts-gradient.test.ts`; RED Full Verification #28751033299 failed in Core tests before implementation, and GREEN PR-head Full Verification #28772353798 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m57s. Storage Restore Drill #28772353810 and Storage Backup Retention #28772353751 passed for the same head. Product delta is recorded in `docs/product/penpot-radial-gradient-svg-artifact-delta.md`. Remaining gaps are elliptical/rotated radial width geometry, radial stroke/PDF/raster/canvas parity, non-rect/path/group/text radial artifacts, exact mixed-stack overlay/blend compositing, image-gradient interactions, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations; deployment remains intentionally deferred. |"
current_block = row + "\n| _None_ | Idle | No active plan. Latest completed Penpot maturity-loop slice is `2026-07-06-penpot-radial-gradient-svg-artifact.md`; deployment remains intentionally deferred. |"
fixed_current = "| _None_ | Idle | No active plan. Latest completed Penpot maturity-loop slice is `2026-07-06-penpot-radial-gradient-svg-artifact.md`; deployment remains intentionally deferred. |"
if current_block not in status:
    raise RuntimeError("Expected misplaced current-plan row not found")
status = status.replace(current_block, fixed_current, 1)
completed_header = "## Completed Plans\n\n| Plan | Status | Evidence |\n| --- | --- | --- |\n"
if completed_header not in status:
    raise RuntimeError("Completed Plans header not found")
status = status.replace(completed_header, completed_header + row + "\n", 1)
path.write_text(status, encoding="utf-8")
