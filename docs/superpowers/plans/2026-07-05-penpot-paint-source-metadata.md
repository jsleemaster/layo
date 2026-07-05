# Penpot Paint Source Metadata

Date: 2026-07-05
Branch: `codex/penpot-paint-source-metadata`

## Penpot Comparison

Reference capability: Penpot keeps paint records as structured source data, including gradient stops, gradient geometry, opacity, blend modes, and image references. Layo's existing Penpot mapper intentionally flattened simple gradients and paint stacks into one renderable `style.fill` or `style.stroke`, which made the imported canvas deterministic but lost the original source record needed for later exact rendering and developer handoff.

Decision: adapt.

Layo should keep the deterministic flattened paint for current rendering while preserving the original Penpot paint records as migration metadata. This fits Layo's local-first and agent-operable model because agents can inspect the source structure without requiring the browser renderer to support full Penpot compositing immediately.

## Goal

Preserve Penpot paint source metadata for imported shapes so the next Penpot maturity loops can build exact gradient, blend, image, and multi-paint fidelity from stored source evidence instead of re-reading the original `.penpot` archive.

## Implementation

- `apps/server/src/external-migration.ts` enriches imported Penpot nodes with `style.paint_sources` after the base importer maps the document.
- The preserved source includes paint origin, kind, paint type, stack index, opacity, blend mode, image id, gradient type, gradient start/end geometry, width, and stops.
- `apps/server/src/agent-control.ts` exposes `paintSources` in deterministic canvas inspection summaries.
- `apps/server/src/code-export.ts` adds `style.paintSources` and a `Penpot paint` annotation to exported structures and generated element modules.
- `apps/server/src/external-migration.penpot-paint-source.test.ts` covers direct import, HTTP persistence, agent inspection, code export structure, and generated JS module serialization.

## Verification

- Full Verification `#28743060413` passed on code head `bd83bf69e006e15629c456110193b92898575960` in 8m3s.
- Passed gates: Penpot maturity and design rule gates, typecheck, web build, Core tests, and Playwright CLI e2e.
- The focused regression imports a Penpot rect with fill and stroke gradients, verifies flattened render style remains `fill: #800080`, `stroke: #008080`, and proves the original Penpot gradient stops, geometry, opacity, and blend modes persist through storage, agent inspection, code export, and JS modules.

## Remaining Gap

This slice preserves source metadata but does not yet render exact Penpot compositing. The next import/export loop should use `style.paint_sources` to close visible rendering or export fidelity for exact gradient geometry, blend modes, and multi-paint stack compositing.

Deployment remains intentionally deferred.
