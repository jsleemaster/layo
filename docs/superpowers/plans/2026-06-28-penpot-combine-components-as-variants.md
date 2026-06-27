# Penpot Combine Components As Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Penpot-style `Combine as variants` workflow so multiple selected main components can become one component definition with generated variants.

**Architecture:** Extend the existing component variant model instead of adding a new variant-area model in this slice. The first selected main component remains the base definition; the other selected main component definitions are removed, and all selected source nodes are represented as variants on the base definition. Web reducer undo/redo, server agent commands, and the right-click context menu share the same behavior contract.

**Tech Stack:** React, TypeScript, Fastify, Node test runner, Playwright CLI, `@layo/renderer` component definitions.

---

### Task 1: Reducer Contract

**Files:**
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/src/editor-state.ts`

- [x] **Step 1: Write the failing reducer test**

Add a test named `combines selected main components into generated variants with undo and redo`. It creates two same-page main component definitions (`Button / Primary`, `Button / Secondary`), runs `combine_components_as_variants`, and expects one component with `variant=Primary/Secondary`.

- [x] **Step 2: Run reducer test to verify RED**

Run: `pnpm --filter @layo/web test -- --run apps/web/src/editor-state.test.ts -t "combines selected main components into generated variants"`

Expected: FAIL because `combine_components_as_variants` is not implemented.

- [x] **Step 3: Implement minimal reducer behavior**

Add command types:
- `combine_components_as_variants`
- `restore_component_snapshot`

The reducer validates at least two selected main component source nodes, rejects components that already have more than the default empty variant, generates variant values from the last slash-delimited node-name segment, stores previous components for undo, and selects the base source node.

- [x] **Step 4: Run reducer test to verify GREEN**

Run: `pnpm --filter @layo/web test -- --run apps/web/src/editor-state.test.ts -t "combines selected main components into generated variants"`

Expected: PASS.

### Task 2: Agent Command Contract

**Files:**
- Modify: `apps/server/src/http.test.ts`
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/mcp.ts`

- [x] **Step 1: Write the failing server test**

Add a test named `serves agent commands that combine components as variants`. It creates two rectangles, turns each into a component, applies `combine_components_as_variants`, and asserts `/files/sample-file/components` returns one definition with generated variants.

- [x] **Step 2: Run server test to verify RED**

Run: `pnpm --filter @layo/server test -- --run apps/server/src/http.test.ts -t "serves agent commands that combine components as variants"`

Expected: FAIL because the agent command schema/reducer does not accept the new command.

- [x] **Step 3: Implement minimal server behavior**

Add `combine_components_as_variants` to `AgentCommand`, `agentCommandSchema`, and `applyAgentCommand`. Use the same validation and generation rules as the web reducer, returning the base source node id as the changed node.

- [x] **Step 4: Run server test to verify GREEN**

Run: `pnpm --filter @layo/server test -- --run apps/server/src/http.test.ts -t "serves agent commands that combine components as variants"`

Expected: PASS.

### Task 3: Context Menu UI

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `apps/web/src/App.tsx`

- [x] **Step 1: Write the failing e2e test**

Add a Playwright test that creates two component source nodes through agent commands, multi-selects them from the layer panel, right-clicks one selected source node, clicks `변형으로 결합`, and verifies the right inspector variant matrix and instance variant selector show `Primary` and `Secondary`.

- [x] **Step 2: Run e2e test to verify RED**

Run: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --workers=1 --reporter=line --grep "combines selected components as variants from the context menu"`

Expected: FAIL because the context menu item is missing.

- [x] **Step 3: Implement minimal UI**

Add `canCombineSelectedComponentsAsVariants` derived state, `combineContextComponentsAsVariants`, and a `변형으로 결합` item in the `컴포넌트` context menu section. Disable it unless the current multi-selection contains at least two unlocked main component source nodes on the same page and each selected definition has no authored variants yet.

- [x] **Step 4: Run e2e test to verify GREEN**

Run: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --workers=1 --reporter=line --grep "combines selected components as variants from the context menu"`

Expected: PASS.

### Task 4: Docs And Gates

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update maturity docs**

Record that Layo now supports a Penpot-style bulk combine-as-variants workflow through UI and agent commands, while variant-area layout and shared-layer override preservation remain future maturity gaps.

- [x] **Step 2: Run full verification**

Run:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm test
pnpm --filter @layo/web test:e2e -- --grep "combines selected components as variants from the context menu"
git diff --check
```

Expected: all PASS.

- [x] **Step 3: Commit, push, PR, merge, cleanup**

Commit with `feat: combine components as variants`, push branch, create PR through GitHub REST, merge through GitHub REST after checks are adequate, then delete the remote/local branch and remove the worktree.

Completed through PR #162.

## Verification Evidence

- RED reducer: `pnpm --filter @layo/web test -- --run apps/web/src/editor-state.test.ts -t "combines selected main components into generated variants"` failed before reducer support because the command had no inverse snapshot.
- GREEN reducer: `pnpm --filter @layo/web test -- --run apps/web/src/editor-state.test.ts -t "combines selected main components into generated variants"` passed.
- RED server: `pnpm --filter @layo/server test -- --run apps/server/src/http.test.ts -t "serves agent commands that combine components as variants"` failed before the agent command combined definitions.
- GREEN server: `pnpm --filter @layo/server test -- --run apps/server/src/http.test.ts -t "serves agent commands that combine components as variants"` passed.
- RED Playwright CLI: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --workers=1 --reporter=line --grep "combines selected components as variants from the context menu"` failed before the context menu exposed `변형으로 결합`.
- GREEN Playwright CLI: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --workers=1 --reporter=line --grep "combines selected components as variants from the context menu"` passed.
- Full gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @layo/web build`, `pnpm test:e2e` with 129 passing tests, and `git diff --check` passed.
