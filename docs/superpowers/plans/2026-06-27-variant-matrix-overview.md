# Variant Matrix Overview

**Goal:** Move Layo's component variant authoring closer to Penpot by showing selected main components a property-combination matrix with duplicate-combination warnings.

**Penpot reference:** https://help.penpot.app/user-guide/design-systems/variants/

Penpot frames each variant as one unique combination of values across properties, such as `Color=Primary + Size=Small + State=Hover`, and says property values should stay consistent so switching stays predictable.

**Adopt/adapt/diverge:**
- Adopt: show a matrix-level view of variant names against property columns.
- Adopt: flag duplicate completed combinations because two variants with the same property values make instance switching ambiguous.
- Adapt: use Layo's existing string-based `ComponentVariant.properties[]` model and right Inspector authoring surface instead of adding a separate component-set canvas object.
- Defer: drag-reorderable matrix columns/rows, batch mixed-value editing, and explicit variant property type authoring.

**Maturity gate:** Design systems, gate 3 in `docs/product/penpot-maturity-benchmark.md`.

## Plan

1. Add RED Playwright CLI coverage:
   - author `surface` and `size` rows,
   - add a second variant with a distinct combination,
   - verify a matrix table lists variant rows and property columns,
   - add a third variant with the same completed combination as the default row,
   - verify a duplicate-combination warning appears.
2. Implement a small matrix helper from the existing variant array.
3. Render the matrix in the selected-main-component right Inspector without changing persistence semantics.
4. Update maturity docs/status so matrix-level management narrows from missing to basic overview plus later advanced editing.
5. Verify focused RED/GREEN, full tests, Playwright CLI, PR/merge, and cleanup.

## RED Evidence

- `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "main component variant authoring shows a combination matrix and duplicate warning" --workers=1 --reporter=line` failed because `inspector-component-variant-matrix` was absent from the selected-main-component Inspector.

## GREEN Evidence

- Focused Playwright CLI GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "main component variant authoring shows a combination matrix and duplicate warning" --workers=1 --reporter=line` passed.
- Focused typecheck GREEN: `pnpm --filter @layo/web typecheck` passed.
- Design rule GREEN: `pnpm run check:design-rules` passed.
- Variant regression GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "right inspector authors component variants on selected main components|right inspector authors multi-property component variant combinations|main component variant authoring shows a combination matrix and duplicate warning|component instances render boolean variant properties as toggles" --workers=1 --reporter=line` passed with 4 tests.
- Full typecheck GREEN: `pnpm typecheck` passed.
- Full test GREEN: `pnpm test` passed.
- Web build GREEN: `pnpm --filter @layo/web build` passed.
- Penpot maturity guard GREEN: `pnpm run check:penpot-maturity` passed.
- Whitespace gate GREEN: `git diff --check` passed.
- Full Playwright CLI GREEN: `pnpm test:e2e` passed with 121 tests.
- Headed Playwright CLI proof GREEN: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts --grep "main component variant authoring shows a combination matrix and duplicate warning" --workers=1 --headed --reporter=line` passed.
- Collaboration Playwright CLI GREEN: `pnpm test:e2e:collab` passed with 5 tests after starting the local relay.
