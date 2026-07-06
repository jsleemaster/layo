from pathlib import Path

status_path = Path("docs/superpowers/PLAN_STATUS.md")
plan_path = Path("docs/superpowers/plans/2026-07-06-penpot-radial-gradient-svg-artifact.md")
delta_path = Path("docs/product/penpot-radial-gradient-svg-artifact-delta.md")

status = status_path.read_text(encoding="utf-8")
status = status.replace(
    "| `2026-07-06-penpot-radial-gradient-svg-artifact.md` | In progress | Penpot maturity-loop slice for selected-layer SVG simple circular radial fill gradients. RED Full Verification #28751033299 failed in Core tests because SVG artifacts fell back to `fill=\"#800080\"` without `<defs>/<radialGradient>`. Implementation is on `codex/penpot-radial-gradient-svg-artifact`; PR-head GREEN verification is pending. |",
    "| _None_ | Idle | No active plan. Latest completed Penpot maturity-loop slice is `2026-07-06-penpot-radial-gradient-svg-artifact.md`; deployment remains intentionally deferred. |",
    1,
)
completed_header = "| Plan | Status | Evidence |\n| --- | --- | --- |\n"
new_row = "| `2026-07-06-penpot-radial-gradient-svg-artifact.md` | Completed | Adapts preserved Penpot radial fill paint-source metadata to emit selected-layer SVG `<radialGradient>` paint servers for supported simple circular non-text, non-group nodes while keeping deterministic `data-fallback-fill` and leaving PDF/raster/canvas radial parity as follow-up work. The regression is `apps/web/src/node-artifacts-gradient.test.ts`; RED Full Verification #28751033299 failed in Core tests before implementation, and GREEN PR-head Full Verification #28772353798 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m57s. Storage Restore Drill #28772353810 and Storage Backup Retention #28772353751 passed for the same head. Product delta is recorded in `docs/product/penpot-radial-gradient-svg-artifact-delta.md`. Remaining gaps are elliptical/rotated radial width geometry, radial stroke/PDF/raster/canvas parity, non-rect/path/group/text radial artifacts, exact mixed-stack overlay/blend compositing, image-gradient interactions, masks, paths, SVG raw shapes, components, variants, tokens, and shared library relations; deployment remains intentionally deferred. |\n"
status = status.replace(completed_header, completed_header + new_row, 1)
status_path.write_text(status, encoding="utf-8")

plan = plan_path.read_text(encoding="utf-8")
plan = plan.replace(
    "- GREEN: pending PR-head Full Verification after documentation and PR creation.",
    "- GREEN: PR-head Full Verification #28772353798 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m57s. Storage Restore Drill #28772353810 and Storage Backup Retention #28772353751 passed for the same head.",
    1,
)
plan_path.write_text(plan, encoding="utf-8")

delta = delta_path.read_text(encoding="utf-8")
delta = delta.replace(
    "- GREEN PR-head Full Verification is pending after PR creation.",
    "- GREEN PR-head Full Verification #28772353798 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m57s. Storage Restore Drill #28772353810 and Storage Backup Retention #28772353751 passed for the same head.",
    1,
)
delta_path.write_text(delta, encoding="utf-8")
