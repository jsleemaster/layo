# Penpot Typography Token Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Penpot-inspired typography token slice so selected text layers can bind to reusable typography tokens through document state, agent commands, Inspector UI, DTCG import/export, and code export.

**Architecture:** Reuse Layo's existing flat `DesignToken` model and deterministic command pipeline. Store typography tokens as `DesignToken.type = "typography"` with a JSON string value containing `fontFamily`, `fontSize`, and optional `lineHeight`; bind text layers through `content.typography_token` while still materializing `font_family` and `font_size` for rendering and legacy compatibility.

**Tech Stack:** TypeScript renderer/server/web, Rust `editor-core` model with `ts-rs`, Vitest, Playwright CLI, GitHub REST workflow.

---

## Penpot Comparison

- Reference: Penpot design tokens document, `https://help.penpot.app/user-guide/design-systems/design-tokens/`, which includes typography tokens and composite typography values.
- Decision: Adopt the product behavior as a first-class design-system token, adapt the storage shape to Layo's current flat token list and deterministic command architecture.
- Maturity gate: Design systems, developer handoff, and agent safety.
- Remaining divergence after this slice: token sets/modes, richer typography fields, typography style libraries, and hosted library sync remain out of scope.

## File Map

- Modify `packages/renderer/src/index.ts`: extend token and text content contracts.
- Modify `apps/server/src/storage.ts`: extend storage token and text content contracts.
- Modify `apps/server/src/design-token-io.ts`: import/export DTCG typography composite tokens.
- Modify `apps/server/src/agent-control.ts`: validate typography token references and add `set_text_typography_token`.
- Modify `apps/server/src/mcp.ts`: expose the same agent command through MCP schema.
- Modify `apps/server/src/code-export.ts`: export typography tokens as CSS variables and structure metadata.
- Modify `apps/web/src/editor-state.ts`: undoable `set_text_typography_token`.
- Modify `apps/web/src/App.tsx`: right Inspector typography token select and persistence.
- Modify `crates/editor-core/src/model.rs`: Rust JSON round-trip and generated TypeScript binding support.
- Test `apps/server/src/design-token-io.test.ts`, `apps/server/src/code-export.test.ts`, `apps/server/src/storage.test.ts`, `apps/web/src/editor-state.test.ts`, `crates/editor-core/tests/document_model.rs`, and `apps/web/e2e/editor-mvp.spec.ts`.
- Update `docs/product/penpot-maturity-benchmark.md` and `docs/superpowers/PLAN_STATUS.md`.

### Task 1: RED Tests

- [x] **Step 1: Add failing coverage for typography tokens**

Add tests that expect:

```ts
{ id: "typography-heading-lg", name: "Typography / Heading LG", type: "typography", value: "{\"fontFamily\":\"Inter\",\"fontSize\":32,\"lineHeight\":40}" }
```

to import/export through DTCG, bind to `text-1`, survive agent persistence, show in code export, round-trip through Rust JSON, and appear in the right Inspector.

- [x] **Step 2: Run focused tests to verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/design-token-io.test.ts src/code-export.test.ts src/storage.test.ts --runInBand
pnpm --filter @layo/web test -- src/editor-state.test.ts --runInBand
cargo test -p editor-core typography_token_round_trips_through_json --test document_model
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "right inspector binds imported typography tokens to text layers" --workers=1 --reporter=line
```

Expected: FAIL because `typography` is not a token type, `typography_token` is not in text content, the command does not exist, and the Inspector control does not exist.

Observed before implementation: the server token/export/storage tests rejected missing typography support, the web editor-state command was unknown, Rust rejected `DesignTokenType::Typography`, and the focused Playwright CLI flow reported zero imported typography tokens.

### Task 2: Model And Agent Semantics

- [x] **Step 1: Extend token/text contracts**

Add `typography` to token types and optional `typography_token?: string | null` to text content in renderer, server storage, and Rust model.

- [x] **Step 2: Add typography token parsing**

Create helpers that parse token values as JSON with:

```ts
{
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
}
```

Reject malformed or non-positive values at the command boundary.

- [x] **Step 3: Add `set_text_typography_token`**

When the token is valid, set `content.font_family`, `content.font_size`, and `content.typography_token`; leave `lineHeight` stored in the token for export/handoff until the full text style model lands.

### Task 3: Import Export And Handoff

- [x] **Step 1: DTCG import/export**

Map `$type: "typography"` composite tokens into the JSON string value and export the JSON string back to an object.

- [x] **Step 2: Code export**

Include typography tokens in `implementationSpec.tokens.typography`, emit `--layo-token-typography-*: <fontSize>` plus `--layo-token-typography-*-font-family` and optional `--layo-token-typography-*-line-height`, and emit text CSS using those variables when a bound token exists.

### Task 4: Web Inspector

- [x] **Step 1: Add editor command**

Add undo/redo-safe `set_text_typography_token` to `apps/web/src/editor-state.ts`.

- [x] **Step 2: Add right Inspector control**

For selected text nodes, show `data-testid="inspector-text-typography-token"` when typography tokens exist. Changing it dispatches the editor command and persists through `/agent/commands`.

### Task 5: Verification, PR, Merge

- [x] **Step 1: Run focused GREEN tests**

Run the commands from Task 1 and verify all pass.

Observed current worktree GREEN:

```bash
pnpm --filter @layo/server test -- src/design-token-io.test.ts src/code-export.test.ts src/storage.test.ts --runInBand
# 7 files passed, 111 tests passed

pnpm --filter @layo/web test -- src/editor-state.test.ts --runInBand
# 15 files passed, 144 tests passed

cargo test -p editor-core typography_token_round_trips_through_json --test document_model
# 1 passed

pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "right inspector binds imported typography tokens to text layers" --workers=1 --reporter=line
# 1 passed
```

- [x] **Step 2: Run broad verification**

Run:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

Observed current worktree GREEN:

```bash
pnpm run check:penpot-maturity
# 3 passed

pnpm run check:design-rules
# Design rules passed.

pnpm typecheck
# 5 workspace projects passed typecheck

pnpm --filter @layo/web build
# Vite production build completed

git diff --check
# no whitespace errors

pnpm test
# repository script passed, including pnpm -r test and cargo test --workspace

pnpm test:e2e
# 123 passed
```

- [x] **Step 3: Publish and merge**

Push branch, create PR with Penpot reference and RED/GREEN evidence, merge after checks, sync `main`, and run post-merge cleanup.

Observed: PR #154, `https://github.com/jsleemaster/layo/pull/154`, was squash-merged as `b731a356dcd1e1faeaebffdfba5898129d072b34`; main was fast-forwarded, the feature worktree was removed, and the local and remote feature branches were deleted.
