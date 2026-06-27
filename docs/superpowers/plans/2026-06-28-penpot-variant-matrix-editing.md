# Penpot Variant Matrix Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Penpot-inspired direct component variant matrix editing, property deletion, and variant deletion in the right Inspector.

**Architecture:** Reuse Layo's existing saved `ComponentDefinition.variants[]` model and `set_component_variants` command instead of adding a new server route. The matrix is a second editing surface over the same variant array, so changes must keep the row editor, selected-instance controls, HTTP persistence, undo/redo, and invalid-instance fallback behavior aligned.

**Tech Stack:** React/Vite in `apps/web/src/App.tsx`, Playwright CLI e2e in `apps/web/e2e/editor-mvp.spec.ts`, Vitest editor-state regression in `apps/web/src/editor-state.test.ts`, token-based CSS in `apps/web/src/styles.css`.

---

### Task 1: RED Browser Coverage For Matrix Editing

**Files:**
- Modify: `apps/web/e2e/editor-mvp.spec.ts`

- [x] **Step 1: Write the failing Playwright test**

Add this test after `main component variant authoring shows a combination matrix and duplicate warning`:

```ts
test("component variant matrix edits cells and deletes properties and variants", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();

  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("flat");
  await page.getByTestId("inspector-component-variant-property-add").click();
  await page.getByTestId("inspector-component-definition-variant-property-name-default-1").fill("size");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-1").fill("regular");
  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Elevated Large");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("elevated");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-1").fill("large");

  const matrixSizeCell = page.getByTestId("inspector-component-variant-matrix-cell-variant-2-size");
  await expect(matrixSizeCell).toHaveValue("large");
  await matrixSizeCell.fill("compact");
  await expect(page.getByTestId("inspector-component-definition-variant-property-value-variant-2-1")).toHaveValue(
    "compact"
  );

  await page.getByTestId("inspector-component-variant-property-remove-size").click();
  await expect(page.getByTestId("inspector-component-variant-matrix")).not.toContainText("size");
  await expect(page.getByTestId("inspector-component-definition-variant-property-name-default-1")).toHaveCount(0);
  await expect(page.getByTestId("inspector-component-variant-property-remove-surface")).toBeDisabled();

  await page.getByTestId("inspector-component-variant-remove-variant-2").click();
  await expect(page.getByTestId("inspector-component-variant-matrix-row-variant-2")).toHaveCount(0);
  await expect(page.getByTestId("inspector-component-variant-remove-default")).toBeDisabled();

  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --grep "component variant matrix edits cells and deletes properties and variants" --workers=1 --reporter=line
```

Expected: FAIL because `inspector-component-variant-matrix-cell-variant-2-size` does not exist yet.

### Task 2: RED State Coverage For Variant Deletion Fallback

**Files:**
- Modify: `apps/web/src/editor-state.test.ts`

- [x] **Step 1: Write the failing unit regression**

Add a focused assertion to `sets component definition variants and resets invalid instance selections with undo and redo` or a new nearby test showing that when `variant-elevated` is removed through `set_component_variants`, the instance falls back to `variant-flat`, and undo restores `variant-elevated`.

```ts
const deleted = executeEditorCommand(selected, {
  type: "set_component_variants",
  componentId: "component-1",
  variants: [{ id: "variant-flat", name: "Flat", properties: [{ name: "surface", value: "flat" }] }]
});
expect((findNodeById(deleted.document, "instance-1")?.component_instance as any)?.variant_id).toBe("variant-flat");

const restored = undo(deleted);
expect((findNodeById(restored.document, "instance-1")?.component_instance as any)?.variant_id).toBe(
  "variant-elevated"
);
```

- [x] **Step 2: Verify RED or Existing Coverage**

Run:

```bash
pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "sets component definition variants"
```

Expected: If it already passes, record that reducer semantics were pre-covered and keep the assertion as regression coverage. If it fails, implement against the reducer.

### Task 3: Implement Matrix Editing Helpers And Controls

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Add variant helper functions**

Add helpers near the existing component variant helper functions:

```ts
function updateComponentVariantMatrixCell(
  variants: ComponentVariant[],
  variantId: string,
  propertyName: string,
  value: string
): ComponentVariant[] {
  return variants.map((variant) => {
    if (variant.id !== variantId) {
      return variant;
    }
    const properties = visibleVariantProperties(variant);
    const propertyIndex = properties.findIndex((property) => property.name.trim() === propertyName);
    if (propertyIndex === -1) {
      return variant;
    }
    const nextProperties = [...properties];
    nextProperties[propertyIndex] = { ...nextProperties[propertyIndex], value };
    return { ...variant, properties: nextProperties };
  });
}

function removeComponentVariantPropertyAcrossVariants(
  variants: ComponentVariant[],
  propertyName: string
): ComponentVariant[] {
  return variants.map((variant) => ({
    ...variant,
    properties: visibleVariantProperties(variant).filter((property) => property.name.trim() !== propertyName)
  }));
}

function removeComponentVariant(variants: ComponentVariant[], variantId: string): ComponentVariant[] {
  return variants.filter((variant) => variant.id !== variantId);
}
```

- [x] **Step 2: Add delete handlers**

Inside `Inspector`, add local handlers that keep Penpot's constraints:

```ts
const removeComponentDefinitionVariantProperty = (propertyName: string) => {
  if (componentDefinitionVariantMatrix.propertyNames.length <= 1) {
    return;
  }
  updateComponentDefinitionVariants(removeComponentVariantPropertyAcrossVariants(componentDefinitionVariants, propertyName));
};

const removeComponentDefinitionVariant = (variantId: string) => {
  if (componentDefinitionVariants.length <= 1) {
    return;
  }
  updateComponentDefinitionVariants(removeComponentVariant(componentDefinitionVariants, variantId));
};
```

- [x] **Step 3: Render editable matrix controls**

Update the matrix table:

```tsx
<th key={name} scope="col">
  <div className="component-variant-matrix-header-cell">
    <span>{name}</span>
    <button
      type="button"
      className="inspector-icon-button"
      data-testid={`inspector-component-variant-property-remove-${safeTestId(name)}`}
      disabled={componentDefinitionVariantMatrix.propertyNames.length <= 1}
      aria-label={`${name} 속성 삭제`}
      onClick={() => removeComponentDefinitionVariantProperty(name)}
    >
      ×
    </button>
  </div>
</th>
```

Render variant row deletion and editable cell inputs:

```tsx
<th scope="row">
  <div className="component-variant-matrix-header-cell">
    <span>{row.variant.name}</span>
    <button
      type="button"
      className="inspector-icon-button"
      data-testid={`inspector-component-variant-remove-${safeTestId(row.variant.id)}`}
      disabled={componentDefinitionVariants.length <= 1}
      aria-label={`${row.variant.name} 변형 삭제`}
      onClick={() => removeComponentDefinitionVariant(row.variant.id)}
    >
      ×
    </button>
  </div>
</th>
```

```tsx
<td key={name}>
  <input
    className="component-variant-matrix-input"
    data-testid={`inspector-component-variant-matrix-cell-${safeTestId(row.variant.id)}-${safeTestId(name)}`}
    aria-label={`${row.variant.name} ${name} 값`}
    value={row.values[name] ?? ""}
    placeholder="값 없음"
    onChange={(event) =>
      updateComponentDefinitionVariants(
        updateComponentVariantMatrixCell(componentDefinitionVariants, row.variant.id, name, event.currentTarget.value)
      )
    }
  />
</td>
```

- [x] **Step 4: Add compact token-based styling**

Add CSS for `component-variant-matrix-header-cell` and `component-variant-matrix-input` using existing token variables only.

### Task 4: GREEN Verification

**Files:**
- Verify only

- [x] **Step 1: Run focused e2e**

```bash
node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts --grep "component variant matrix edits cells and deletes properties and variants|main component variant authoring shows a combination matrix and duplicate warning" --workers=1 --reporter=line
```

Expected: PASS.

- [x] **Step 2: Run focused web state test**

```bash
pnpm --filter @layo/web exec vitest run src/editor-state.test.ts -t "sets component definition variants"
```

Expected: PASS.

### Task 5: Product Docs And Full Gates

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [x] **Step 1: Update benchmark wording**

Move `advanced matrix editing` from remaining design-system gaps to landed posture as `matrix cell editing, property deletion with last-property guard, and variant deletion with invalid-instance fallback`.

- [x] **Step 2: Update plan status**

Add a completed row for `2026-06-28-penpot-variant-matrix-editing.md` after verification.

- [x] **Step 3: Run full gates**

```bash
pnpm run check:penpot-maturity
pnpm run check:design-rules
pnpm typecheck
pnpm --filter @layo/web build
pnpm test
pnpm test:e2e
git diff --check
```

Expected: all pass.

- [x] **Step 4: Direct Playwright CLI proof**

Start `pnpm dev`, then use Playwright from the CLI to create a component, edit a matrix cell, delete a property, delete a variant, and record that the right Inspector row editor and matrix both update.

### Task 6: Publish, Merge, Cleanup

**Files:**
- Verify only

- [ ] **Step 1: Commit and push**

```bash
git status --short
git add apps/web/e2e/editor-mvp.spec.ts apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/editor-state.test.ts docs/product/penpot-maturity-benchmark.md docs/superpowers/PLAN_STATUS.md docs/superpowers/plans/2026-06-28-penpot-variant-matrix-editing.md
git commit -m "feat: add variant matrix editing"
git push -u origin codex/variant-matrix-editing
```

- [ ] **Step 2: Create PR through GitHub REST, not `gh`**

Use the available GitHub token and call `POST /repos/jsleemaster/layo/pulls`.

- [ ] **Step 3: Merge PR through GitHub REST**

Squash merge after verifying PR state.

- [ ] **Step 4: Post-merge cleanup**

Run the repository cleanup process: sync `main`, remove the worktree, delete local and remote feature branches, verify `git worktree list`, `git status --short --branch`, and confirm local dev ports are clear.
