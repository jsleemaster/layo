# Penpot Gradient SVG Artifact Delta

Last checked: 2026-07-05

## Reference

Penpot remains the open-source benchmark for design artifact fidelity. The relevant capability is preserving gradient paint intent when a selected layer is exported as a design artifact.

Reference sources:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/

## Layo Decision

Adapt.

Layo continues to keep the imported flattened `style.fill` fallback, but selected-layer SVG artifacts now use preserved Penpot `style.paint_sources` metadata to define a simple fill `linearGradient` paint server and apply it to the exported rectangle.

## Product Evidence

- `RendererNode.style.paint_sources` is typed for preserved Penpot paint metadata.
- Selected-layer SVG artifacts include a shared `<defs>` block with `<linearGradient>` for simple preserved Penpot fill gradients.
- SVG stops preserve color, sorted offset, and stop/source opacity through `stop-opacity`.
- The exported rect uses `fill="url(#...)"` while retaining `data-fallback-fill` with the deterministic flattened color.

## Verification

- RED Full Verification `#28744752449` failed in Core tests before implementation.
- Final GREEN Full Verification `#28745127711` passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 6m28s.

The focused regression is `apps/web/src/node-artifacts-gradient.test.ts`.

## Remaining Gap

PDF/raster artifacts, live canvas rendering, radial gradients, stroke-gradient artifacts, blend modes, and exact multi-paint compositing still use fallback behavior or remain unsupported.

Deployment remains intentionally deferred.