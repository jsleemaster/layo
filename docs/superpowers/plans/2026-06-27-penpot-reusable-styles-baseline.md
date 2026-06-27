# Penpot Reusable Styles Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: Completed on 2026-06-27. Routing evidence is recorded in `docs/superpowers/PLAN_STATUS.md`; remaining unchecked boxes below are historical planning structure, not active work.

**Goal:** Add a Penpot-inspired reusable color and typography style baseline so Layo can save style assets, bind selected nodes to them, expose them through the right Inspector and agent surface, and include style metadata in code export.

**Architecture:** Reuse Layo's existing token and binding primitives instead of creating a hosted library system in this slice. Add document-level `styles` with `color` and `typography` entries, node bindings `style.fill_style` and `content.typography_style`, and commands that materialize styles onto nodes while preserving the style ids for export and later updates.

**Tech Stack:** TypeScript renderer/server/web state, Fastify storage and agent commands, React Inspector, Vitest, Playwright CLI, Rust serde/ts-rs document model.

## Global Constraints

- Penpot reference: https://help.penpot.app/user-guide/design-systems/assets/ names Colors and Typographies as reusable assets, and describes applying colors to selected fills and typographies to selected text layers.
- Layo decision: adapt. Keep the slice document-local and deterministic; hosted shared-library registry/update sync remains a later maturity gap.
- Maturity gate: Design systems.
- Browser debugging and visual verification must use Playwright CLI.
- Preserve local-first saved document semantics.
- Keep web UI Korean-first.
- Use TDD: write failing tests and verify RED before production code.

---

## Task 1: RED Tests

**Files:**
- Modify: `apps/server/src/code-export.test.ts`
- Modify: `apps/server/src/storage.test.ts`
- Modify: `apps/web/src/editor-state.test.ts`
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
- Modify: `crates/editor-core/tests/document_model.rs`

**Interfaces:**
- Produces expected document field `styles?: DesignStyle[]`.
- Produces expected node fields `style.fill_style?: string | null` and text `content.typography_style?: string | null`.
- Produces expected agent commands `create_style`, `set_fill_style`, and `set_text_typography_style`.

- [ ] Add failing server export coverage:

```ts
test("exports reusable style bindings as implementation metadata", () => {
  const fixture = tossFixture() as any;
  fixture.styles = [
    { id: "style-color-brand-primary", name: "Brand / Primary", type: "color", value: "#3182f6" },
    {
      id: "style-typography-heading-lg",
      name: "Typography / Heading LG",
      type: "typography",
      value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 })
    }
  ];
  fixture.pages[0].children[0].style.fill_style = "style-color-brand-primary";
  const label = fixture.pages[0].children[0].children[0];
  label.content = { ...label.content, font_family: "Inter", font_size: 32, typography_style: "style-typography-heading-lg" };

  const result = exportDesignToCode(fixture);

  expect(result.implementationSpec.styles).toEqual(fixture.styles);
  expect(result.elements[0].structure.style.fillStyle).toBe("style-color-brand-primary");
  expect((result.elements[0].structure.children[0].content as any).typographyStyle).toBe("style-typography-heading-lg");
});
```

- [ ] Add failing storage/agent coverage:

```ts
test("agent commands create reusable styles and apply them to selected node fields", async () => {
  const storage = await storageWithDocument(tempRoot);
  const response = await storage.applyAgentCommands("sample-file", {
    dryRun: false,
    commands: [
      { type: "create_style", style: { id: "style-color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" } },
      { type: "set_fill_style", nodeId: "text-1", styleId: "style-color-brand-primary" }
    ]
  } as any);
  expect(response.file.styles).toContainEqual(expect.objectContaining({ id: "style-color-brand-primary" }));
  expect(findNode(response.file, "text-1")?.style).toMatchObject({ fill: "#2563eb", fill_style: "style-color-brand-primary" });
});
```

- [ ] Add failing web state coverage:

```ts
test("applies reusable color and typography styles with undo and redo", () => {
  const document = sampleDocument() as any;
  document.styles = [
    { id: "style-color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" },
    { id: "style-typography-heading-lg", name: "Typography / Heading LG", type: "typography", value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 }) }
  ];
  const initial = createEditorState(document);
  const styled = executeEditorCommand(initial, { type: "set_fill_style", nodeId: "text-1", styleId: "style-color-brand-primary" } as any);
  expect(findNodeById(styled.document, "text-1")?.style).toMatchObject({ fill: "#2563eb", fill_style: "style-color-brand-primary" });
  expect(findNodeById(undo(styled).document, "text-1")?.style.fill_style).toBeUndefined();
});
```

- [ ] Add failing Playwright CLI coverage:

```ts
test("right inspector creates and applies reusable styles", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-fill").fill("#2563eb");
  await page.getByRole("button", { name: "색상 스타일 저장" }).click();
  await page.getByTestId("style-name-input").fill("Brand / Primary");
  await page.getByRole("button", { name: "스타일 생성" }).click();
  await expect(page.getByTestId("inspector-fill-style")).toContainText("Brand / Primary");
  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect((await fileResponse.json()).file.styles).toContainEqual(expect.objectContaining({ id: "style-color-brand-primary" }));
});
```

- [ ] Add failing Rust serde coverage:

```rust
#[test]
fn reusable_styles_round_trip_through_json() {
    let raw = r##"{ "id": "style-file", "name": "Style File", "version": 1, "styles": [{ "id": "style-color-brand-primary", "name": "Brand / Primary", "type": "color", "value": "#2563eb" }], "pages": [] }"##;
    let parsed: DesignFile = serde_json::from_str(raw).unwrap();
    assert_eq!(parsed.styles.len(), 1);
    assert!(serde_json::to_string(&parsed).unwrap().contains("\"styles\""));
}
```

- [ ] Run focused tests and record expected RED failures.

## Task 2: Document Model And Validation

**Files:**
- Modify: `packages/renderer/src/index.ts`
- Modify: `apps/server/src/storage.ts`
- Modify: `apps/server/src/agent-control.ts`
- Modify: `crates/editor-core/src/model.rs`
- Regenerate: `crates/editor-core/bindings/DesignFile.ts`
- Regenerate: `crates/editor-core/bindings/Node.ts`
- Create/regenerate: `crates/editor-core/bindings/DesignStyle.ts`

**Interfaces:**
- `DesignStyle { id: string; name: string; type: "color" | "typography"; value: string }`
- `RendererDocument.styles?: DesignStyle[]`
- `DesignNode.style.fill_style?: string | null`
- Text content `typography_style?: string | null`

- [ ] Add shared renderer/server/Rust style types and optional document/node binding fields.
- [ ] Validate duplicate style ids, empty names/values, unsupported style types, missing `fill_style`, and missing `typography_style`.
- [ ] Parse typography style JSON with the same shape as typography tokens: `{ fontFamily, fontSize, lineHeight? }`.

## Task 3: Agent Commands And Code Export

**Files:**
- Modify: `apps/server/src/agent-control.ts`
- Modify: `apps/server/src/code-export.ts`
- Modify: `apps/server/src/mcp.ts`

**Interfaces:**
- `create_style` inserts or replaces a style by id.
- `set_fill_style` resolves a color style, writes `style.fill`, clears `fill_token`, and stores `fill_style`.
- `set_text_typography_style` resolves a typography style, writes text font properties, clears `typography_token`, and stores `typography_style`.
- Code export returns `implementationSpec.styles` and node structure `fillStyle` / `typographyStyle`.

- [ ] Implement style lookup and materialization helpers.
- [ ] Add commands with dry-run/apply support through the existing agent command route.
- [ ] Add style metadata and CSS fallback comments to code export without changing token behavior.

## Task 4: Web Inspector Behavior

**Files:**
- Modify: `apps/web/src/editor-state.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/document-api.ts`

**Interfaces:**
- Editor commands `create_style`, `set_fill_style`, and `set_text_typography_style`.
- Inspector test ids: `inspector-fill-style`, `style-name-input`, `inspector-text-typography-style`.

- [ ] Add undo/redo-safe style commands.
- [ ] Render selected-node reusable color style controls near fill controls.
- [ ] Render selected-text reusable typography style controls near typography token controls.
- [ ] Persist style creation/application through the existing agent command HTTP path.
- [ ] Keep labels Korean-first: `색상 스타일`, `색상 스타일 저장`, `타이포그래피 스타일`, `스타일 생성`.

## Task 5: Verification, Docs, PR, Cleanup

**Files:**
- Modify: `docs/product/penpot-maturity-benchmark.md`
- Modify: `docs/superpowers/PLAN_STATUS.md`

- [ ] Run focused server, web, Rust, and Playwright CLI tests.
- [ ] Run `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `pnpm test`, `cargo test --workspace`, `pnpm test:e2e`, and `git diff --check`.
- [ ] Update maturity docs to move reusable styles from missing to baseline-present, while keeping richer style management and hosted library sync as gaps.
- [ ] Commit, push, create PR via GitHub REST, review/merge, then clean the worktree and branch without `gh`.

## Completion Evidence

- RED/GREEN focused storage regression: `manual fill updates clear reusable fill style bindings` failed before `setNodeFill` cleared `fill_style`, then passed after the fix.
- RED/GREEN e2e reliability regression: `pnpm test:e2e` failed with `net::ERR_CONNECTION_REFUSED` because Playwright assumed external dev servers on `127.0.0.1:5173`/`4317`; `scripts/run-e2e.mjs` now starts the server and web dev services, waits for readiness, runs Playwright CLI, and cleans up its own processes.
- Focused GREEN: server storage/code-export/MCP tests, web editor-state tests, Rust document model tests, and Playwright CLI `right inspector creates and applies reusable styles`.
- Broad GREEN after final changes: `pnpm run check:penpot-maturity`, `pnpm run check:design-rules`, `pnpm typecheck`, `pnpm --filter @layo/web build`, `pnpm test`, `cargo test --workspace`, `pnpm test:e2e` with 125 tests, and `git diff --check`.
