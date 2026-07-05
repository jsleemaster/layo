# Penpot Gradient PDF Artifact Delta

Last checked: 2026-07-05

## Reference

Penpot remains the open-source benchmark for design artifact fidelity. The relevant capability is preserving gradient paint intent when a selected layer is exported as a design artifact.

Reference sources:

- https://github.com/penpot/penpot
- https://help.penpot.app/user-guide/export-import/export-import-files/

## Layo Decision

Adapt.

Layo continues to keep the imported flattened `style.fill` fallback, but selected-layer PDF artifacts now use preserved Penpot `style.paint_sources` metadata for simple fill linear gradients. The PDF export emits an axial shading resource and paints it through a clipped rectangle, then preserves the existing stroke pass.

## Product Evidence

- Selected-layer PDF artifacts collect a dedicated gradient fill entry for simple preserved Penpot fill linear gradients.
- PDF resources include `/Shading` entries for supported gradients.
- PDF content clips to the node rectangle and invokes `/Sh1 sh` instead of filling with only the flattened fallback color.
- Existing stroke commands remain after gradient fill rendering.

## Verification

- RED Full Verification `#28746017528` failed in Core tests before implementation.
- GREEN Full Verification `#28746327138` passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m38s.

The focused regression is `apps/web/src/node-artifacts-gradient.test.ts`.

## Remaining Gap

Raster artifacts, live canvas rendering, radial gradients, stroke-gradient artifacts, stop-specific PDF alpha, blend modes, and exact multi-paint compositing still use fallback behavior or remain unsupported.

Deployment remains intentionally deferred.
