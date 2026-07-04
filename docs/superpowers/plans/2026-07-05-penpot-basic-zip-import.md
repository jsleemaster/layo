# 2026-07-05 Penpot Basic ZIP Import

## Goal

Close the next Penpot import/export maturity gap by adapting Penpot v3 ZIP exports into Layo's existing external migration review/import path for basic pages, frames, rectangles, and text.

Deployment remains intentionally deferred for this loop.

## Penpot Comparison

Reference capability: Penpot can export/import `.penpot` and ZIP files whose current readable package structure includes `manifest.json`, file JSON, page JSON, and per-shape JSON entries.

Layo decision: adapt. Layo should not become a Penpot clone, but it should accept the same open, self-hostable file handoff shape where it maps cleanly into the local-first Layo document model.

## Scope

- Detect real Penpot v3 ZIP packages without making the older loose Penpot preflight fixture importable.
- Review Penpot v3 ZIP exports as importable when they contain readable file/page package data.
- Import the first Penpot file into a fresh Layo design file.
- Map Penpot page, frame, rectangle, and text shape data into Layo page/node primitives.
- Keep imported assets empty for this slice.
- Preserve existing Figma REST JSON and Figma ZIP package import behavior.

## Non-Goals

- Penpot assets and image fills.
- Penpot components, variants, tokens, shared libraries, effects, constraints, advanced geometry, and path/vector fidelity.
- Multi-file Penpot package selection UI.
- Deployment or hosted migration workflow changes.

## RED Evidence

Full Verification run `28714372031` failed on the new focused Penpot tests before implementation:

- Review returned `canImport: false`, `blockedBy: ["mapping_not_implemented"]`, and too many document candidates.
- Import threw `Only Figma REST JSON exports are importable in this migration slice.`

## GREEN Evidence

Full Verification run `28714926928` passed in 7m36s on PR #220:

- Penpot maturity and design rule gates passed.
- Typecheck passed.
- Web build passed.
- Core tests passed, including focused Penpot ZIP mapper coverage and HTTP review/import persistence coverage.
- Playwright CLI e2e passed, including the file-panel `.penpot` upload, review, import, layer-panel, and persisted file-payload proof.

## Follow-Up Gaps

- Penpot image assets and fills.
- Penpot components, instances, variants, tokens, styles, and shared-library semantics.
- Effects, constraints, masks, paths, groups, and advanced transforms.
- Multi-file package UX and conflict handling.
