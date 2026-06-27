# Penpot Style Library Organization

**Goal:** Make document-local reusable styles feel more like a Penpot asset library by adding duplication plus discoverable organization controls in the right Inspector.

**Architecture:** Keep the current document-local `DesignStyle[]` model. Add `duplicate_style` to the deterministic agent command surfaces and web editor state. Derive style groups from slash-delimited names such as `Brand / Accent`; do not add a new schema field for grouping in this slice. The Inspector adds search, type filtering, and sorting before rendering grouped style rows.

**Penpot reference:** Penpot assets support duplicate, delete, rename, search, sort, type filtering, and slash-based grouping. Layo adapts those library ergonomics to local color and typography styles first, then can later grow hosted library sync.

## Tasks

- [x] Confirm baseline on an isolated worktree with `pnpm test`.
- [x] Add RED server storage coverage for `duplicate_style`.
- [x] Add RED web editor-state coverage for duplicate undo/redo.
- [x] Add RED Playwright CLI coverage for right Inspector search, type filter, sort, grouping, and duplicate.
- [x] Implement `duplicate_style` in server agent commands and MCP schema.
- [x] Implement `duplicate_style` in web editor state with undo/redo.
- [x] Add right Inspector style search, filter, sort, grouped rows, and duplicate actions.
- [x] Update maturity docs and plan status.
- [x] Run focused and broad verification.
- [ ] Commit, push, open PR, merge, and clean the worktree.

## Acceptance

- Duplicating a style copies `type` and `value`, uses a new id/name, and starts with `usageCount` 0.
- Duplicate command rejects missing source styles, empty target ids/names, and duplicate target ids.
- Undo removes a duplicated style; redo restores it.
- Inspector controls are Korean-first, compact, and visible in the existing right sidebar, not a new top toolbar.
- Search filters style names and ids.
- Type filtering can isolate color or typography styles.
- Sorting can show name ascending, name descending, and usage-descending order.
- Slash-delimited names render as group labels.
- Playwright CLI proves the visible workflow and persisted JSON state.

## Verification

- RED server: `pnpm --filter @layo/server exec vitest run src/storage.test.ts -t "duplicate reusable styles"` failed because `duplicate_style` did not create the copy.
- RED web state: `pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "duplicates reusable styles"` failed because the command had no inverse.
- RED Playwright CLI: `pnpm test:e2e -- --grep "right inspector organizes reusable styles"` failed on missing `style-group-brand` after running the suite wrapper.
- GREEN focused server: `pnpm --filter @layo/server exec vitest run src/storage.test.ts -t "duplicate reusable styles"`.
- GREEN focused web state: `pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "duplicates reusable styles"`.
- GREEN focused Playwright CLI: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --grep "right inspector organizes reusable styles" --workers=1 --reporter=line`.
- GREEN docs and design gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`.
- GREEN focused suites: `pnpm --filter @layo/server exec vitest run src/storage.test.ts`, `pnpm --filter @layo/web exec vitest run src/editor-state.test.ts`.
- GREEN integration: `pnpm typecheck`, `pnpm --filter @layo/web build`, `pnpm test`, `pnpm test:e2e` with 126 passing tests, `git diff --check`.
