# Penpot Variant Property Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make component variant properties explicitly typed during authoring, then persist and use those types for selected instance controls.

**Architecture:** Adopt the Penpot variant authoring model as a Layo design-system slice. `ComponentProperty` gains a persisted `type` field with `select` as the default and `boolean` as the first explicit non-select type. Existing legacy documents remain readable because missing property types default to `select`, while selected instance controls use explicit `boolean` before falling back to legacy value-pair inference.

**Tech Stack:** Rust `editor-core` JSON/ts-rs model, renderer TypeScript contracts, Fastify storage/HTTP, React Inspector, Vitest, Rust tests, Playwright CLI.

---

## Penpot Comparison

- **Reference capability:** Penpot component variants expose property/value authoring in the Design tab, and boolean-like properties can render as instance toggles.
- **Decision:** Adapt. Layo keeps local-first JSON and deterministic HTTP/MCP storage, but adds an explicit property type so authoring intent is not inferred only from string values.
- **Maturity gate:** Design systems gate 3: variables, styles, components, variants, libraries, and code mappings are first-class document concepts.
- **Gap closed by this slice:** Explicit variant property type authoring.
- **Remaining gaps after this slice:** Richer theme/mode management, advanced matrix editing, hosted library registry/update sync.

## Files

- Modify: `packages/renderer/src/index.ts` for the shared `ComponentProperty` contract.
- Modify: `crates/editor-core/src/model.rs` and generated `crates/editor-core/bindings/ComponentProperty.ts`.
- Modify: `crates/editor-core/tests/document_model.rs` for JSON round-trip/default coverage.
- Modify: `apps/server/src/storage.ts` and `apps/server/src/http.test.ts` for persisted HTTP semantics.
- Modify: `apps/web/src/editor-state.test.ts` for undo/redo preservation.
- Modify: `apps/web/src/App.tsx` for authoring UI and instance control behavior.
- Modify: `apps/web/e2e/editor-mvp.spec.ts` for visible Playwright CLI proof.
- Modify: `docs/product/penpot-maturity-benchmark.md` and `docs/superpowers/PLAN_STATUS.md` after verification.

## Tasks

### Task 1: Model And Server RED Tests

- [x] **Step 1: Verify baseline**

Run:

```bash
pnpm test
```

Expected: PASS before this slice changes behavior.

- [x] **Step 2: Add Rust JSON tests**

Add `component_property_types_round_trip_through_json` to `crates/editor-core/tests/document_model.rs`. It must parse a component variant property with `"type": "boolean"` and assert it serializes back with that type.

Add `legacy_component_property_type_defaults_to_select` to the same file. It must parse a property without `"type"` and assert the model defaults to `Select`.

- [x] **Step 3: Run Rust RED**

Run:

```bash
cargo test -p editor-core component_property
```

Expected: FAIL because `ComponentProperty` has no `type` field yet.

- [x] **Step 4: Add HTTP RED**

Extend `apps/server/src/http.test.ts` component variant coverage so a `PUT /files/:fileId/components/:componentId/variants` payload containing `{ name: "enabled", value: "true", type: "boolean" }` is returned by `GET /files/:fileId/components`.

- [x] **Step 5: Run server RED**

Run:

```bash
pnpm --filter @layo/server exec vitest run src/http.test.ts -t "component variant"
```

Expected: FAIL because storage normalization drops `type`.

### Task 2: Web State And UI RED Tests

- [x] **Step 1: Add editor-state RED**

Extend `apps/web/src/editor-state.test.ts` so `set_component_variants` preserves a boolean property type through undo and redo.

- [x] **Step 2: Run web state RED**

Run:

```bash
pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "component definition variants"
```

Expected: FAIL because the current type contract has no typed property assertion.

- [x] **Step 3: Add Playwright RED**

Add a focused test in `apps/web/e2e/editor-mvp.spec.ts` named `component variant property types choose toggle or select controls explicitly`.

The test should:

1. Create a component from the default frame.
2. Select the main component and set property `enabled=true`.
3. Select the property type control `data-testid="inspector-component-definition-variant-property-type-default-0"` to `boolean`.
4. Add a second variant with `enabled=false`.
5. Create and select an instance.
6. Assert `inspector-component-variant-enabled-toggle` is visible and `inspector-component-variant-enabled` select is absent.
7. Toggle it off and assert the selected instance changes to the disabled variant.
8. Add or use a `select`-typed `surface=true/false` property and assert it renders as a select, proving explicit `select` overrides boolean-like value inference.

- [x] **Step 4: Run Playwright RED**

Run:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "component variant property types choose toggle or select controls explicitly" --workers=1 --reporter=line
```

Expected: FAIL because the authoring type select does not exist.

### Task 3: Minimal Implementation

- [x] **Step 1: Extend shared contracts**

Update `packages/renderer/src/index.ts`:

```ts
export type ComponentPropertyType = "select" | "boolean";

export interface ComponentProperty {
  name: string;
  value: string;
  type?: ComponentPropertyType;
}
```

Change `ComponentVariant.properties` to `ComponentProperty[]`.

- [x] **Step 2: Extend Rust model**

Add:

```rust
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ComponentPropertyType {
    Select,
    Boolean,
}
```

Then update `ComponentProperty` with a serde-renamed defaulted field:

```rust
#[serde(default, rename = "type")]
pub r#type: ComponentPropertyType,
```

Add a `Default` implementation returning `Select`, and preserve generated TypeScript bindings.

- [x] **Step 3: Normalize storage**

Update `normalizeComponentVariant` so every property has `type: "boolean"` only when the input explicitly says `"boolean"`, otherwise `type: "select"`.

- [x] **Step 4: Update web authoring helpers**

In `apps/web/src/App.tsx`, add a property-type helper and an across-variants updater:

```ts
function componentPropertyType(property: ComponentProperty): ComponentPropertyType {
  return property.type === "boolean" ? "boolean" : "select";
}
```

Use it to show a `select` control for each variant property row and to propagate type changes by property index across all variants.

- [x] **Step 5: Update instance controls**

Make `componentVariantControls` compute `propertyType`. Render toggles only for explicit `boolean` properties or legacy untyped boolean-like pairs. Render a select when a property is explicitly `select`, even if its values are `true` and `false`.

### Task 4: GREEN Verification And Docs

- [x] **Step 1: Run focused GREEN tests**

Run:

```bash
cargo test -p editor-core component_property
pnpm --filter @layo/server exec vitest run src/http.test.ts -t "component variant"
pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "component definition variants"
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "component variant property types choose toggle or select controls explicitly" --workers=1 --reporter=line
```

Expected: PASS.

- [x] **Step 2: Run direct Playwright CLI proof**

Start the e2e-managed dev services or `pnpm dev`, then use Playwright CLI/API logging to perform the authoring and instance toggle flow. Record the visible result in this plan.

- [x] **Step 3: Update benchmark docs**

Update `docs/product/penpot-maturity-benchmark.md` to move explicit variant property type authoring from immature to landed.

Update `docs/superpowers/PLAN_STATUS.md` with this plan after verification.

- [x] **Step 4: Run full gates**

Run:

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
cargo test --workspace
git diff --check
```

Expected: PASS.

## Execution Evidence

- Baseline: `pnpm test` passed before implementation.
- RED: `cargo test -p editor-core component_property` failed because serialized component properties had `type: Null` instead of `boolean` or `select`.
- RED: `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "component variant"` failed because HTTP/storage returned properties without `type`.
- Existing behavior note: `pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "component definition variants"` already preserved unknown property fields through structured clone; the test was kept as regression coverage.
- RED: `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --grep "component variant property types choose toggle or select controls explicitly" --workers=1 --reporter=line` failed on missing `inspector-component-definition-variant-property-type-default-0`.
- GREEN focused:
  - `cargo test -p editor-core component_property`
  - `cargo test -p editor-core export_bindings_componentproperty`
  - `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "component variant"`
  - `pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "component definition variants"`
  - `pnpm --filter @layo/server exec vitest run src/code-export.test.ts -t "exports component definitions and instance references for agents"`
  - `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --grep "component instances render boolean variant properties as toggles|component variant property types choose toggle or select controls explicitly" --workers=1 --reporter=line`
- Direct Playwright CLI proof: using `pnpm exec node --input-type=module` with `@playwright/test`, the live editor created a component, set `enabled` to `boolean`, left `surface` as `select`, created an instance, verified `enabled` rendered as a checked toggle and `surface` rendered as a select with value `true`, then clicked the toggle and observed `enabledChecked: false` and `surfaceValue: "false"`.
- Full gates:
  - `pnpm run check:penpot-maturity`
  - `pnpm run check:design-rules`
  - `pnpm typecheck`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e` with 127 passing tests
  - `git diff --check`

### Task 5: Publish, Merge, Cleanup

- [ ] **Step 1: Commit**

Commit with:

```bash
git add .
git commit -m "feat: add variant property types"
```

- [ ] **Step 2: Push and create PR without gh**

Push the branch and create a PR through GitHub REST.

- [ ] **Step 3: Merge without gh**

Merge the PR with squash after verification through GitHub REST.

- [ ] **Step 4: Post-merge cleanup**

Follow `docs/process/post-merge-cleanup.md`: update main, remove the worktree, delete the local/remote branch if safe, and verify clean status.
