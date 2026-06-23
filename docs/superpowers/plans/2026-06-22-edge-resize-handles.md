# Edge Resize Handles

Date: 2026-06-22
Status: Completed

## Goal

Add Figma-like edge resize handles for a single selected canvas object.

## Scope

- Render top, right, bottom, and left resize handles alongside the existing
  corner handles.
- Keep the immediate selection size badge visible.
- Right and left edge handles resize width only.
- Top and bottom edge handles resize height only.
- Preserve existing corner resize behavior and undoable geometry updates.
- Verify through Playwright CLI against the live editor.

## Deferred

- Shift aspect-ratio resize.
- Rotation handle and rotation inspector controls.
- Multi-selected bounding-box resize.
- Constraints modifier behavior during resize.

## TDD Plan

1. Keep existing corner resize e2e green as baseline.
2. Add RED Playwright coverage for missing edge handles and one-axis resize.
3. Expand resize handle geometry and hit regions from four corners to eight
   handles.
4. Re-run focused corner plus edge resize e2e.
5. Run typecheck, build, full e2e, full test, and headed Playwright proof.

## Verification Targets

- `pnpm --dir apps/web exec vitest run src/editor-state.test.ts`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "resize handles" --reporter=line`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "edge resize handles" --headed --workers=1 --reporter=line`
- `pnpm test:e2e`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `pnpm test`

## Verification Completed

- RED: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "edge resize handles" --reporter=line`
  failed because `resize-handle-top` did not exist.
- GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "resize handles" --reporter=line`
- GREEN: `pnpm --dir apps/web exec vitest run src/editor-state.test.ts`
- GREEN: `pnpm typecheck`
- GREEN: `pnpm --filter @layo/web build`
- GREEN: `pnpm test:e2e`
- GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "edge resize handles" --headed --workers=1 --reporter=line`
- GREEN: `pnpm test`
