# Variant Boolean Controls

**Goal:** Move Layo's component variant controls closer to Penpot by rendering boolean-like component instance properties as toggles instead of dropdowns.

**Penpot reference:** https://help.penpot.app/user-guide/design-systems/variants/#component-variants-toggle

Penpot shows a toggle when a copy is selected and a variant property has exactly two opposing values: `true/false`, `yes/no`, or `on/off`.

**Adopt/adapt/diverge:**
- Adopt: selected component instances render boolean-like variant properties as checkbox toggles.
- Adopt: `true`, `yes`, and `on` map to the checked state; `false`, `no`, and `off` map to unchecked.
- Adapt: keep Layo's existing string-based `ComponentVariant.properties[]` model instead of adding a separate property-type field.
- Defer: explicit property type authoring, tri-state properties, and full matrix-level variant management.

**Maturity gate:** Design systems, gate 3 in `docs/product/penpot-maturity-benchmark.md`.

## Plan

1. Add RED Playwright CLI coverage:
   - author a component with `enabled=true` and `enabled=false` variants,
   - create an instance,
   - verify the instance Inspector renders a toggle instead of a select,
   - click the toggle and verify it selects the opposite variant value.
2. Add a small boolean-pair detector for variant property values.
3. Render boolean controls as checkboxes while preserving existing select controls for non-boolean properties.
4. Update maturity docs/status so richer variant property controls narrow to explicit property types and matrix-level management.
5. Verify focused RED/GREEN, full tests, Playwright CLI, PR/merge, and cleanup.

## RED Evidence

- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "component instances render boolean variant properties as toggles" --workers=1 --reporter=line` first failed with `net::ERR_CONNECTION_REFUSED` because the dev server was not running.
- After starting `pnpm dev`, the same command failed correctly because `inspector-component-variant-enabled` still rendered as a select and the expected boolean toggle was absent.

## GREEN Evidence

- Focused Playwright CLI GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "component instances render boolean variant properties as toggles" --workers=1 --reporter=line` passed.
- Focused typecheck GREEN: `pnpm --filter @layo/web typecheck` passed.
- Variant regression GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "right inspector authors component variants on selected main components|right inspector authors multi-property component variant combinations|component instances render boolean variant properties as toggles" --workers=1 --reporter=line` passed with 3 tests.
- Maturity docs GREEN: `pnpm run check:penpot-maturity` passed.
- Design rule GREEN: `pnpm run check:design-rules` passed.
- Web build GREEN: `pnpm --filter @layo/web build` passed.
- Workspace typecheck GREEN: `pnpm typecheck` passed.
- Full local test GREEN: `pnpm test` passed.
- Full editor Playwright CLI GREEN: `pnpm test:e2e` passed with 120 tests.
- Direct UI proof GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "component instances render boolean variant properties as toggles" --workers=1 --headed --reporter=line` passed, exercising the visible instance Inspector toggle path.
- Collaboration Playwright CLI GREEN: `pnpm test:e2e:collab` passed with 5 tests after starting the local TypeScript relay.
