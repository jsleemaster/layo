# Penpot Variant Source Switching

**Goal:** Make Layo component variants materialize distinct source layer trees, so switching a component instance variant changes the canvas tree like a mature design-system workflow rather than only changing metadata.

**Architecture:** Extend the shared component variant contract with optional `source_node`. Use a compatibility fallback to `ComponentDefinition.source_node` for legacy documents. Centralize instance materialization so create-instance and set-instance-variant both clone the selected variant source, rename ids into the instance namespace, keep root instance identity, and reapply compatible text overrides.

**Reference:** https://help.penpot.app/user-guide/design-systems/variants/

## Files

- Modify `packages/renderer/src/index.ts` to add `ComponentVariant.source_node`.
- Modify `crates/editor-core/src/model.rs` to serialize optional `ComponentVariant.source_node`.
- Modify `apps/web/src/editor-state.ts` to materialize variant source trees on instance create/switch and generated variant combine.
- Modify `apps/server/src/storage.ts` to mirror web behavior for HTTP/MCP storage operations.
- Modify `apps/server/src/agent-control.ts` so agent combine commands keep generated variant source trees.
- Modify tests in `apps/web/src/editor-state.test.ts`, `apps/server/src/storage.test.ts`, and `crates/editor-core/tests/document_model.rs`.
- Update product/process docs after GREEN verification.

## TDD Steps

- [x] Add web reducer test proving `create_component_instance` uses the first variant source tree when present.
- [x] Add web reducer test proving `set_component_instance_variant` swaps to the target variant source tree and preserves a compatible text override.
- [x] Add web reducer test proving `combine_components_as_variants` stores each selected node as a generated variant source.
- [x] Add server storage test proving `setComponentInstanceVariant` persists the target variant source tree.
- [x] Add Rust JSON round-trip test for `ComponentVariant.source_node`.
- [x] Run focused tests and confirm RED.
- [x] Implement shared source selection and instance materialization helpers.
- [x] Run focused tests and confirm GREEN.
- [x] Run maturity/design/type/test/build/e2e gates.
- [x] Prepare for REST PR, merge, and post-merge cleanup.

## Commands

```bash
pnpm --filter @layo/web test -- src/editor-state.test.ts -t "variant source tree"
pnpm --filter @layo/server test -- src/storage.test.ts -t "component instance variant source tree"
cargo test -p editor-core component_variant_source_node_round_trips
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm test
pnpm --filter @layo/web build
pnpm test:e2e
git diff --check
```

## Evidence

- RED web: `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "variant source tree"` failed because instances still used `ComponentDefinition.source_node`, switch kept the old size/fill, and combined variants had no `source_node`.
- RED server: `pnpm --filter @layo/server test -- src/storage.test.ts -t "component instance variant source tree"` failed because `createComponentInstance` ignored the first variant source tree.
- RED Rust: `cargo test -p editor-core component_variant_source_node_round_trips` failed because `ComponentVariant.source_node` serialized as `Null`.
- GREEN focused: `pnpm --filter @layo/web test -- src/editor-state.test.ts -t "variant source tree"` passed with 157 tests in that filtered run.
- GREEN focused: `pnpm --filter @layo/server test -- src/storage.test.ts -t "component instance variant source tree"` passed with 127 tests in that filtered run.
- GREEN focused: `cargo test -p editor-core component_variant_source_node_round_trips` passed.
- Playwright CLI proof: `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "combines selected components as variants from the context menu" --reporter=line` passed and verifies that selecting the Secondary variant changes selected-instance width and fill in the Inspector.
- Gates: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `pnpm test`, `pnpm test:e2e`, and `git diff --check` passed.
