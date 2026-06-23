# Object Copy/Paste Shortcuts

Date: 2026-06-22
Status: Completed

## Goal

Add the next small Figma-parity editing slice: copying the currently selected
canvas object with Cmd/Ctrl+C and pasting it with Cmd/Ctrl+V.

## Scope

- Store copied canvas objects in an in-app session clipboard.
- Paste copied objects through the existing editor command pipeline so undo,
  redo, selection state, and collaboration presence follow current behavior.
- Create deterministic pasted ids and Korean copy names using the existing
  duplicate naming pattern.
- Offset repeated pastes by 24 px so the pasted object is visibly distinct.
- Keep existing image-file clipboard paste behavior working when no object has
  been copied in the editor session.

## Deferred

- Multi-node object copy/paste.
- Paste-here at pointer location.
- OS clipboard object interchange with external design tools.
- Cross-document parent targeting beyond first-page fallback when the original
  parent no longer exists.

## TDD Plan

1. Add RED state tests for `copySelectedNode` and `pasteCopiedNode`.
2. Implement pure editor-state clipboard helpers.
3. Add RED Playwright coverage for Cmd/Ctrl+C and Cmd/Ctrl+V.
4. Wire App keyboard shortcuts to the session clipboard.
5. Verify focused tests, full editor e2e, typecheck, build, and direct
   Playwright CLI interaction on the live editor.

## Verification Targets

- `pnpm --dir apps/web exec vitest run src/editor-state.test.ts`
- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "object clipboard" --reporter=line`
- `pnpm test:e2e`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- Direct Playwright CLI interaction against `http://127.0.0.1:5173/`

## Verification Completed

- RED: `pnpm --filter @layo/web test -- src/editor-state.test.ts`
  failed on missing `copySelectedNode`.
- RED: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "object clipboard" --reporter=line`
  failed because no pasted layer appeared.
- GREEN: `pnpm --dir apps/web exec vitest run src/editor-state.test.ts`
- GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "object clipboard" --reporter=line`
- GREEN: `pnpm test:e2e`
- GREEN: `pnpm typecheck`
- GREEN: `pnpm --filter @layo/web build`
- GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "object clipboard" --headed --workers=1 --reporter=line`
- GREEN: `pnpm test`
