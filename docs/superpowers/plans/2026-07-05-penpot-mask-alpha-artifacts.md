# Penpot Mask Alpha Artifacts

## Goal

Close the next Penpot mask maturity gap that does not depend on the blocked `App.tsx` canvas rendering edit: selected-layer artifacts must not discard preserved Penpot mask source opacity.

## Penpot Comparison

Penpot's current open-source mask renderer defines both clip and mask resources for masked shapes. Layo previously used polygon clip paths in selected SVG/PDF artifacts, which preserved shape geometry but treated translucent mask sources as fully opaque hard clips.

Decision: adapt. Keep the existing deterministic bounds/polygon fallback for opaque masks, and use the preserved `clip.source.opacity` only when it can be represented deterministically in selected-layer artifacts.

## Implementation

- Keep opaque Penpot polygon mask sources as SVG `<clipPath>` and PDF clipping paths.
- Render translucent Penpot polygon mask sources as SVG `<mask>` definitions with white polygon/rect mask content and `fill-opacity` from `clip.source.opacity`.
- Apply PDF `/ExtGState` alpha inside the clipping scope for translucent mask sources so selected-layer PDFs preserve the same source opacity signal.
- Leave live canvas rendering and raster snapshot exports for the next loop because they still require the blocked `App.tsx` render path change.

## Regression Coverage

- `apps/web/src/node-artifacts-clip.test.ts` covers opaque polygon SVG clipPath output.
- `apps/web/src/node-artifacts-clip.test.ts` covers translucent polygon SVG mask output with `fill-opacity="0.72"`.
- `apps/web/src/node-artifacts-clip.test.ts` covers opaque polygon PDF clipping paths without a mask graphics state.
- `apps/web/src/node-artifacts-clip.test.ts` covers translucent polygon PDF clipping paths followed by `/MaskGs1 gs` and `/ca 0.72` resources.

## Verification

Full Verification #28741884857 passed Penpot maturity/design gates, typecheck, web build, Core tests, and Playwright CLI e2e in 7m38s on branch head `3aaea0d43b5c08cc0dbcfe285a96e1e9ced9d750`.

Local shell verification remains unavailable in this Codex session because local commands exit 134.
