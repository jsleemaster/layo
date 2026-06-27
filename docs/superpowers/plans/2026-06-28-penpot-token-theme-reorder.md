# Penpot Token Theme Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add Penpot-inspired token theme and theme token-set reorder controls across Layo's server agent commands, web reducer, and right Inspector.

**Architecture:** Keep reorder behavior document-local and deterministic. Server and MCP expose explicit commands, web state uses undoable snapshots, and the Inspector persists controls through the existing agent-command API.

**Tech Stack:** TypeScript, Fastify agent-command route, Zod MCP schema, React, Vitest, Playwright CLI.

---

### Task 1: Server Agent Commands

**Files:**
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/mcp.ts`
- Test: `apps/server/src/http.test.ts`

- [x] **Step 1: Write the failing HTTP test**

Add a test near the existing token theme command tests that sends
`reorder_token_theme` and `reorder_token_theme_set` through
`POST /files/sample-file/agent/commands`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "reorders token themes"
```

Expected: FAIL because the command schema rejects the new command types.

- [x] **Step 3: Implement minimal server behavior**

Extend `AgentCommand`, command execution, helper functions, and MCP Zod schema.
Moving out of bounds must be a no-op that still returns the target id only when
the target exists.

- [x] **Step 4: Verify GREEN**

Run the same focused server test. Expected: PASS.

### Task 2: Web Reducer

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Test: `apps/web/src/editor-state.test.ts`

- [x] **Step 1: Write the failing reducer test**

Add a test proving theme row order and a theme's `token_set_ids` order can be
changed, undo restores the previous order, and redo reapplies it.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "reorders token themes"
```

Expected: FAIL because reducer commands do not exist.

- [x] **Step 3: Implement minimal reducer behavior**

Extend `EditorCommand` with `reorder_token_theme` and
`reorder_token_theme_set`. Reuse `set_document_token_themes` as the inverse
snapshot path and call `materializeTokenBindings`.

- [x] **Step 4: Verify GREEN**

Run the same focused web test. Expected: PASS.

### Task 3: Inspector Controls

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write the failing Playwright CLI test**

Add an e2e test that imports three token sets and two themes, clicks Inspector
theme move buttons and set move buttons, and polls `/files/:id` for the saved
order.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "reorders token theme" --reporter=line
```

Expected: FAIL because the controls do not exist.

- [x] **Step 3: Implement UI and persistence**

Add compact Korean-first up/down controls:

- theme row controls persist `reorder_token_theme`
- selected set controls persist `reorder_token_theme_set`
- unavailable moves are disabled
- status text reports theme order saved

- [x] **Step 4: Verify GREEN**

Run the same Playwright CLI test. Expected: PASS.

### Task 4: Documentation and Gates

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update maturity docs**

Remove `theme reorder` from the current design-system open gap and leave
`visual theme matrix management` plus `hosted theme/library registry sync`.

- [x] **Step 2: Run focused and full gates**

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

Expected: PASS.

### Task 5: PR, Merge, Cleanup

**Files:**
- No code files beyond the implementation files above.

- [x] **Step 1: Commit and push**

Run:

```bash
git status --short
git add apps/server/src/agent-control.ts apps/server/src/mcp.ts apps/server/src/http.test.ts apps/web/src/editor-state.ts apps/web/src/editor-state.test.ts apps/web/src/App.tsx apps/web/e2e/editor-mvp.spec.ts docs/product/penpot-maturity-benchmark.md docs/superpowers/PLAN_STATUS.md docs/superpowers/specs/2026-06-28-penpot-token-theme-reorder-design.md docs/superpowers/plans/2026-06-28-penpot-token-theme-reorder.md
git commit -m "feat: reorder token themes"
git push -u origin codex/token-theme-reorder
```

- [x] **Step 2: Create and merge PR without `gh`**

Use GitHub REST with the local git credential token to create a PR, verify it,
merge it, and delete the remote feature branch.

- [x] **Step 3: Post-merge cleanup**

Fast-forward local `main`, remove the feature worktree, delete the local branch,
and verify `git status --short --branch` plus `git worktree list` are clean.
