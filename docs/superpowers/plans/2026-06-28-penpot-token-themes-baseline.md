# Penpot Token Themes Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Penpot-inspired token themes baseline so Layo can activate grouped theme options that include token sets and rematerialize bound design values.

**Architecture:** Extend the existing token-set model with `DesignTokenTheme` rather than replacing token sets. Active token resolution receives token sets and token themes, computes active set ids from direct enabled sets plus enabled themes, and keeps token-set order as the cascade order. Web, server, MCP, Rust bindings, DTCG import/export, and Inspector controls share the same contract.

**Tech Stack:** TypeScript, React, Fastify, Zod, Rust `ts-rs`, Node test runner, Vitest, Playwright CLI.

---

## Penpot Gap

- Source: https://help.penpot.app/user-guide/design-systems/design-tokens/
- Capability: Token Themes configure token sets for contexts such as brand, mode, and touchpoint. Multiple groups can be active together, while only one theme in a group can be active.
- Layo decision: adopt the document concept, adapt the UI to a compact Inspector baseline, and defer full edit modal/matrix/library sync.
- Maturity gate: Design systems.

### Task 1: Shared Model And DTCG Contract

**Files:**
- Modify: `packages/renderer/src/index.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/design-token-io.ts`
- Modify: `apps/server/src/design-token-io.test.ts`
- Modify: `crates/editor-core/src/model.rs`
- Modify: `crates/editor-core/tests/document_model.rs`

- [x] **Step 1: Write RED DTCG/Rust tests**

Add tests that expect:
- DTCG import reads `$themes` and `$metadata.activeThemes`.
- DTCG export writes `$themes` and active theme ids.
- Rust `DesignFile` round-trips `token_themes`.

Run:

```bash
pnpm --filter @layo/server test -- src/design-token-io.test.ts -t "token themes"
cargo test -p editor-core token_themes_round_trip_through_json
```

Expected: fail because `DesignTokenTheme` and DTCG theme metadata do not exist.

- [x] **Step 2: Implement model and DTCG support**

Add `DesignTokenTheme` with `id`, `name`, optional `group`, `enabled`, and `token_set_ids`. Export/import themes using `$themes` and `$metadata.activeThemes`.

- [x] **Step 3: Verify GREEN**

Run the same focused commands and expect PASS.

Observed: PASS for `pnpm --filter @layo/server test -- src/design-token-io.test.ts -t "token themes"` and `cargo test -p editor-core token_themes_round_trip_through_json`.

### Task 2: Resolution, Agent Command, And Validation

**Files:**
- Modify: `apps/server/src/design-token-io.ts`
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/mcp.ts`
- Modify: `apps/server/src/http.test.ts`
- Modify: `apps/server/src/code-export.ts`
- Modify: `apps/server/src/code-export.test.ts`

- [x] **Step 1: Write RED server tests**

Add tests that expect:
- `set_token_theme_enabled` enables a theme, disables sibling themes in the same group, materializes bound fill tokens, and appears in `inspectCanvas().tokenThemes`.
- Validation reports missing theme token-set references.
- Code export includes token theme metadata.

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts src/code-export.test.ts -t "token theme"
```

Expected: fail because agent commands, inspection, validation, and export metadata do not know themes.

- [x] **Step 2: Implement server behavior**

Update active token resolution to include enabled theme token sets, add `set_token_theme_enabled` to agent command/MCP schema, validate token theme ids/groups/set refs, include `tokenThemes` in inspection and code export.

- [x] **Step 3: Verify GREEN**

Run the same focused server command and expect PASS.

Observed: PASS for `pnpm --filter @layo/server test -- src/http.test.ts src/code-export.test.ts -t "token theme"`.

### Task 3: Web State And Inspector UI

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write RED web tests**

Add reducer coverage for undo/redo-safe `set_token_theme_enabled` with group exclusivity and bound fill rematerialization. Add Playwright CLI coverage that activates a theme from the Inspector and sees a bound rectangle fill update.

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "token theme"
node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --workers=1 --reporter=line --grep "token theme"
```

Expected: fail because the command and UI do not exist.

- [x] **Step 2: Implement web behavior**

Add `set_token_theme_enabled` to `EditorCommand`, update active token resolution calls, and add Korean-first Inspector controls for theme groups and theme toggles.

- [x] **Step 3: Verify GREEN**

Run the same focused web and Playwright CLI commands and expect PASS.

Observed: PASS for `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "token themes"` and `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --workers=1 --reporter=line --grep "right inspector activates imported DTCG token themes"`.

### Task 4: Docs, Full Gates, And Publish

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`
- Modify: `docs/superpowers/plans/2026-06-28-penpot-token-themes-baseline.md`

- [x] **Step 1: Update docs**

Record token themes as a landed baseline and leave richer theme editing/matrix/library sync as remaining gaps.

Observed: `docs/product/penpot-maturity-benchmark.md` and `docs/superpowers/PLAN_STATUS.md` record the landed token-theme baseline and remaining theme-management gaps.

- [x] **Step 2: Run gates**

Run:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm test
pnpm --filter @layo/web build
pnpm test:e2e
git diff --check
```

Expected: all PASS.

Observed: PASS for `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @layo/web build`, `pnpm test:e2e` with 130 passing tests, and `git diff --check`. `cargo fmt --check` was also sampled but failed on pre-existing Rust formatting drift outside this slice, so no broad rustfmt churn was introduced.

- [x] **Step 3: Commit, push, PR, merge, cleanup**

Commit with `feat: add token themes baseline`, push, create PR via GitHub REST, merge via GitHub REST if rules permit, then run post-merge cleanup.

Observed: PR #163, `https://github.com/jsleemaster/layo/pull/163`, was squash-merged as `8d222cf4519e5f4d37a3906aa869e27d73a2b831`. A docs-only finalization pass records the merge/cleanup evidence after the merge because this step cannot be truthfully checked before publication.
