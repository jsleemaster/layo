# Penpot Paint Source Metadata Delta

Last checked: 2026-07-05

## Reference

Penpot remains the open-source benchmark for import/export fidelity in this lane. The relevant capability is preserving structured paint data across migration: gradient stops, gradient geometry, opacity, blend modes, image references, and stack order should remain available even when the target renderer currently supports only a simpler visual subset.

Reference sources:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/
- https://help.penpot.app/user-guide/design-systems/design-tokens/

## Layo Decision

Adapt.

Layo keeps its current deterministic flattened paint style for immediate rendering and handoff stability, but imported Penpot shapes now also preserve the original paint source records under `style.paint_sources`. This avoids pretending that flattened midpoint colors are exact Penpot fidelity while giving future loops durable source evidence for exact gradient geometry, blend modes, and multi-paint compositing.

## Product Evidence

- Imported Penpot fill and stroke paint records preserve source origin, kind, paint type, index, opacity, blend mode, image id, gradient type, gradient start/end geometry, width, and stops.
- Agent inspection exposes the preserved sources as `paintSources`.
- Code export exposes the same sources as `structure.style.paintSources`, adds a `Penpot paint` annotation, and serializes them into generated element modules.
- HTTP import persists the same metadata into stored design files.

## Verification

Full Verification `#28743060413` passed on code head `bd83bf69e006e15629c456110193b92898575960` in 8m3s, including Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e.

The focused regression is `apps/server/src/external-migration.penpot-paint-source.test.ts`.

## Remaining Gap

The preserved metadata is not yet rendered with exact Penpot compositing. The next loop should target one concrete failed case from:

- visible gradient geometry fidelity;
- selected-layer artifact fidelity for original paint geometry;
- blend-mode compositing;
- exact multi-paint stack rendering/export.

Deployment remains intentionally deferred.
