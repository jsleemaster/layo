# Penpot Color Token Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class document color tokens and node fill-token bindings so Layo moves from export-only token candidates toward Penpot-like design-system maturity.

**Architecture:** Add document-level `tokens` to the shared design file contract, keep the existing raw `style.fill` as a resolved fallback, and add optional `style.fill_token` on nodes. Agent commands create/update tokens and bind a node fill to a token; code export resolves bindings to CSS variables with fallbacks and exposes token metadata in `implementationSpec`.

**Tech Stack:** TypeScript renderer/server/web contracts, Rust model serialization, MCP/HTTP agent commands, Vitest, Playwright CLI, Penpot maturity docs.

---

## Reference

- Penpot positions design tokens as a reusable design-system primitive and supports W3C Design Tokens Community Group style import/export: https://help.penpot.app/user-guide/design-systems/design-tokens/
- Penpot's product benchmark for Layo remains the open-source team design platform: https://github.com/penpot/penpot

## Adopt / Adapt / Diverge

- Adopt: document-owned tokens as first-class design-system data, not only code-export suggestions.
- Adapt: start with color tokens and node fill bindings before token sets, modes, typography tokens, spacing tokens, or library publishing.
- Diverge for now: keep local-first document JSON and deterministic agent commands as the primary mutation path instead of adding a hosted token registry.

## Scope

- Add `DesignToken` with `id`, `name`, `type: "color"`, and `value`.
- Add optional `fill_token` to node style while keeping `fill` as the resolved fallback color.
- Add `create_token` and `set_fill_token` agent commands.
- Include tokens in `inspectCanvas`, validation, and code export `implementationSpec`.
- Export CSS variables and use `var(--layo-token-..., fallback)` for token-bound fills.
- Show selected node token binding in the Inspector with a compact Korean readout.
- Update Penpot maturity docs and plan status.

## Defer

- Token sets, modes, aliases, W3C JSON import/export, typography tokens, spacing tokens, style libraries, component library publishing, and team registry workflows.

## File Structure

- Modify: `packages/renderer/src/index.ts`
  - Add shared `DesignToken`, document `tokens`, and node `style.fill_token`.
- Modify: `apps/server/src/storage.ts`
  - Mirror token types for persisted files.
- Modify: `apps/server/src/agent-control.ts`
  - Add token inspection, validation, and agent commands.
- Modify: `apps/server/src/mcp.ts`
  - Add MCP schema entries for token commands.
- Modify: `apps/server/src/code-export.ts`
  - Export token metadata and CSS variable-backed fills.
- Modify: `crates/editor-core/src/model.rs`
  - Add Rust JSON model fields and generated TypeScript bindings.
- Modify: `apps/web/src/editor-state.ts`
  - Preserve undo/redo for `set_fill_token`.
- Modify: `apps/web/src/App.tsx`
  - Show selected node's fill token in Inspector.
- Modify tests:
  - `apps/server/src/storage.test.ts`
  - `apps/server/src/code-export.test.ts`
  - `crates/editor-core/tests/document_model.rs`
  - `apps/web/src/editor-state.test.ts`
  - `apps/web/e2e/editor-mvp.spec.ts`
- Modify docs:
  - `docs/product/penpot-maturity-benchmark.md`
  - `docs/superpowers/PLAN_STATUS.md`

## Task 1: RED Contract And Server Tests

- [x] **Step 1: Add failing server token command test**

Add a test in `apps/server/src/storage.test.ts` proving that `applyAgentCommands("sample-file", { dryRun: true })` can run:

```ts
commands: [
  { type: "create_token", token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" } },
  { type: "set_fill_token", nodeId: "text-1", tokenId: "color-brand-primary" }
]
```

Expected preview:
- `preview.tokens[0]` matches the token.
- `text-1.style.fill` is `#2563eb`.
- `text-1.style.fill_token` is `color-brand-primary`.
- `audit.commandTypes` includes `create_token` and `set_fill_token`.

- [x] **Step 2: Verify server RED**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "color token"
```

Expected: FAIL because command schema/model does not exist.

## Task 2: RED Export And Rust Model Tests

- [x] **Step 1: Add failing code export test**

Add a test in `apps/server/src/code-export.test.ts` that sets:

```ts
fixture.tokens = [{ id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#3182f6" }];
fixture.pages[0].children[0].style.fill_token = "color-brand-primary";
```

Expected:
- `implementationSpec.tokens.colors[0]` includes the token.
- CSS contains `--layo-token-color-brand-primary: #3182f6;`.
- CSS uses `background-color: var(--layo-token-color-brand-primary, #3182f6);`.
- structure style includes `fillToken: "color-brand-primary"`.

- [x] **Step 2: Add failing Rust round-trip test**

Add a test in `crates/editor-core/tests/document_model.rs` proving document `tokens` and node `style.fill_token` round-trip through serde JSON.

- [x] **Step 3: Verify export/Rust RED**

Run:

```bash
pnpm --filter @layo/server test -- src/code-export.test.ts -t "color tokens"
cargo test -p editor-core color_token
```

Expected: FAIL because fields are missing.

## Task 3: Implement Token Model And Agent Commands

- [x] **Step 1: Add shared token fields**

Add `DesignToken` and optional token fields in renderer/server/Rust models:

```ts
export interface DesignToken {
  id: string;
  name: string;
  type: "color";
  value: string;
}
```

Documents expose `tokens?: DesignToken[]`; node style exposes `fill_token?: string | null`.

- [x] **Step 2: Implement validation and agent commands**

In `apps/server/src/agent-control.ts`:
- validate duplicate token ids,
- validate token values for color tokens as non-empty CSS color strings,
- validate node `style.fill_token` references an existing token,
- add `create_token` and `set_fill_token` commands,
- make `set_fill_token` set both `style.fill_token` and resolved `style.fill`.

- [x] **Step 3: Mirror MCP schema**

Add command schema entries in `apps/server/src/mcp.ts`.

- [x] **Step 4: Verify server GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "color token"
```

Expected: PASS.

## Task 4: Export And Rust GREEN

- [x] **Step 1: Implement CSS variable export**

In `apps/server/src/code-export.ts`, add `implementationSpec.tokens.colors` and use token-bound CSS values when `style.fill_token` resolves to a color token.

- [x] **Step 2: Implement Rust serialization**

Add `DesignToken`, `DesignTokenType`, and `fill_token` in `crates/editor-core/src/model.rs`, then regenerate bindings through the existing test/build path.

- [x] **Step 3: Verify export/Rust GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/code-export.test.ts -t "color tokens"
cargo test -p editor-core color_token
```

Expected: PASS.

## Task 5: Web State And Inspector Proof

- [x] **Step 1: Add failing web state test**

Add a test in `apps/web/src/editor-state.test.ts` proving `set_fill_token` is undoable and preserves `style.fill_token` plus resolved `style.fill`.

- [x] **Step 2: Add failing Playwright CLI test**

Add an e2e test in `apps/web/e2e/editor-mvp.spec.ts`:
- create a project,
- apply `create_token` and `set_fill_token` through HTTP agent commands,
- reload the editor,
- select `헤드라인`,
- expect `inspector-fill` to show the resolved color,
- expect a new `inspector-fill-token` readout to show `Brand / Primary`.

- [x] **Step 3: Verify web RED**

Run:

```bash
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "fill token"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "fill token" --workers=1 --reporter=line
```

Expected: FAIL before web command/UI support.

- [x] **Step 4: Implement web state and Inspector readout**

Add a `set_fill_token` editor command and show selected token name in the Inspector when `selectedNode.style.fill_token` resolves against `editor.document.tokens`.

- [x] **Step 5: Verify web GREEN**

Run the same two commands. Expected: PASS.

## Task 6: Docs, Full Verification, Publish

- [x] **Step 1: Update docs**

Update benchmark current posture: design systems now have first-class color tokens and fill bindings; remaining gaps are token sets/modes, typography/spacing tokens, styles, variants, libraries, and code mappings.

- [x] **Step 2: Run focused and broad verification**

```bash
pnpm --filter @layo/server test -- src/storage.test.ts -t "color token"
pnpm --filter @layo/server test -- src/code-export.test.ts -t "color tokens"
cargo test -p editor-core color_token
pnpm --dir apps/web exec vitest run src/editor-state.test.ts -t "fill token"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "fill token" --workers=1 --reporter=line
pnpm --filter @layo/web typecheck
pnpm --filter @layo/server typecheck
pnpm typecheck
pnpm run check:penpot-maturity
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

- [ ] **Step 3: Publish, merge, cleanup**

Commit, push, create PR, review PR patch, merge, sync `main`, delete local/remote branch, prune worktrees, remove generated artifacts, stop dev servers, and verify ports `5173` and `4317` are clear.
