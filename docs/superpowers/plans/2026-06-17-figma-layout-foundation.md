# Figma Layout Foundation Plan

**Goal:** Add the first Figma-parity layout slice: node layout metadata, auto layout stacking, constraints, UI controls, agent commands, export metadata, and Playwright verification.

**Architecture:** Store layout and constraints on nodes. Run a deterministic layout pass after document mutations. Keep the first slice intentionally small: vertical/horizontal auto layout, gap, padding, and basic parent-resize constraints.

## Task 1: Shared Model

- Modify: `packages/renderer/src/index.ts`
- Modify: `crates/editor-core/src/model.rs`
- Modify: generated bindings if required by tests.
- Test: `packages/renderer/src/index.test.ts`
- Test: `crates/editor-core/tests/document_model.rs`

Steps:

- [x] Add optional `layout` and `constraints` fields to nodes.
- [x] Preserve backward compatibility for old documents with missing fields.
- [x] Add JSON round-trip coverage.

## Task 2: Editor State Solver

- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

Steps:

- [x] Add editor commands for `set_node_layout` and `set_node_constraints`.
- [x] Run layout after create, geometry, text, layout, and constraint mutations.
- [x] Stack direct children for vertical/horizontal auto layout.
- [x] Apply constraints when a parent frame resizes.
- [x] Add undo/redo coverage.

## Task 3: Server And Agent Commands

- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/http.ts`
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/server/src/storage.test.ts`
- Test: `apps/server/src/http.test.ts`

Steps:

- [x] Add storage layout pass support for layout and constraints.
- [x] Add agent command types for layout and constraints.
- [x] Include layout and constraints in inspect summaries.
- [x] Keep dry-run and persisted command behavior consistent.

## Task 4: Inspector UI

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

Steps:

- [x] Add compact inspector controls for auto layout mode, direction, gap, padding, and constraints.
- [x] Keep controls tokenized and compact.
- [x] Add Playwright CLI coverage that toggles auto layout and sees child nodes reposition.

## Task 5: Export And Documentation

- Modify: `apps/server/src/code-export.ts`
- Modify: `README.md`
- Test: `apps/server/src/code-export.test.ts`

Steps:

- [x] Include layout and constraints in `implementationSpec`.
- [x] Document layout-related agent commands.
- [x] Keep generated HTML/CSS secondary to structured metadata.

## Verification

Run before PR:

```bash
pnpm test
pnpm typecheck
pnpm --filter @layo/web build
pnpm test:e2e
pnpm test:e2e:collab
cargo test --workspace
```

Run browser verification with Playwright CLI only.
