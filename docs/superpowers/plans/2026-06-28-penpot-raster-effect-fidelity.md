# Penpot Raster Effect Fidelity

## Goal

Close the next developer-handoff gap after SVG/PDF effect artifact fidelity by
making selected-layer PNG/JPEG/WEBP downloads include saved effect-shadow stacks
instead of cropping only the geometric node bounds.

## Penpot Reference

- Penpot layer export includes image formats for selected assets:
  https://help.penpot.app/user-guide/export-import/export-import-files/
- Penpot design-system assets and reusable styling set the expectation that
  visual effects survive handoff:
  https://help.penpot.app/user-guide/design-systems/assets/
  https://help.penpot.app/user-guide/design-systems/design-tokens/

Layo adapts this to the current safe CSS-like shadow stack model. Raster export
now expands the selected crop bounds for stacked shadow offsets, blur, and
spread. Canvas rendering creates one shadow-backed duplicate per parsed layer
behind the primary selected node. This does not claim full arbitrary filter
graphs, inset shadows, or blur-only effects.

## Minimal-Change Ladder

- Reused the existing `style.effect_shadow` and `style.effect_shadows` model.
- Reused the existing Dev Panel PNG/JPEG/WEBP download path and Konva
  `stage.toDataURL` raster pipeline.
- Added only local shadow parsing, local visual bounds expansion, and
  layer-by-layer Konva shadow rendering for the current effect model.

## RED Evidence

This Playwright CLI test was added before production code:

```bash
node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts -g "selected raster artifacts" --workers=1 --reporter=line
```

It failed because a selected text layer with two effect shadows downloaded a PNG
with the same decoded width as the plain export. The failure proved the raster
crop/render path ignored the saved shadow stack.

## GREEN Evidence

```bash
pnpm --filter @layo/web typecheck
node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts -g "selected raster artifacts" --workers=1 --reporter=line
```

The Playwright CLI e2e creates a project, downloads a plain selected-layer PNG,
adds a two-layer effect shadow stack in the right Inspector, downloads
PNG/JPEG/WEBP artifacts from the Dev tab, decodes each image in the browser,
and asserts that the raster dimensions expand beyond the plain export.

## Full Verification

Passed before PR merge on 2026-06-28:

```bash
pnpm run check:design-rules
pnpm run check:penpot-maturity
pnpm typecheck
pnpm --filter @layo/web build
cargo test -p editor-core
pnpm test
pnpm test:e2e
git diff --check
```

The full Playwright CLI suite passed with 141 tests, including the new selected
raster effect artifact flow.

## Remaining Gaps

- Inset shadows, blur-only effects, and non-shadow filter/effect graphs remain
  out of scope for the current Layo effect model.
- Pixel-level visual parity for complex semi-transparent text, image, and nested
  frame effects needs deeper artifact comparison coverage.
- Hosted shared design-system registry and synchronized effect-style updates
  remain later design-system maturity work.
