# Penpot Vector Source Agent Command Delta

Date: 2026-07-06

## Penpot Reference

- Penpot repository: https://github.com/penpot/penpot
- Penpot file import/export: https://help.penpot.app/user-guide/export-import/export-import-files/
- Penpot layer export: https://help.penpot.app/user-guide/export-import/exporting-layers/

## Maturity Gap

Layo already preserves imported Penpot path metadata as `content.vector_source`, exposes it in agent inspect as `vectorSource`, and carries it into structured code export. The remaining gap was agent safety: the preserved vector source was readable but not deterministically editable through the same dry-run, apply, change-summary, inspect, and export loop used by other saved design state.

## Decision

Adapt Penpot path fidelity to Layo's current architecture. This slice does not claim first-class editable vector path rendering. It keeps the existing SVG image asset bridge for visible rendering and adds a typed `set_vector_source` agent command for the preserved Penpot path source metadata used in migration and developer handoff.

## Evidence

- RED: Full Verification run `28801468692`, job `85405662542`, failed in Playwright CLI e2e because `set_vector_source` produced an empty `changeSummary.updatedNodeIds` array during dry-run.
- Test: `apps/web/e2e/external-migration-penpot-path.spec.ts` now verifies dry-run preview, persisted apply, unchanged storage after dry-run, persisted inspect, code export `content.vectorSource`, retained `Penpot vector` annotation, and unchanged SVG image asset bytes.

## Remaining Gaps

- First-class path editing and canvas vector rendering remain future import/export and editor-model maturity gaps.
- The command intentionally mutates handoff/source metadata only; it does not rewrite the current packaged SVG asset bridge.
- Deployment/Vercel proof is deferred for this slice and is not a merge gate.
