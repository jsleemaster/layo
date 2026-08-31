# Editor Entry And Page Navigation Delta

Last checked: 2026-08-31

Status: Completed by PR #322 merge gate; focused Playwright and local full
verification GREEN.

## Reference And Decision

Layo **adapts** three workspace behaviors from Penpot's explicit project entry,
shortcut help, and page navigation:

- https://help.penpot.app/user-guide/account-teams/projects-files/
- https://help.penpot.app/user-guide/designing/workspace-basics/
- https://help.penpot.app/user-guide/first-steps/shortcuts/

Figma remains a secondary behavior baseline for familiar editor navigation. It
is not the implementation owner for this slice. No Figma board, Figma file, or
migration artifact is created by this delta.

Layo keeps one local-first editor shell rather than copying a hosted dashboard.
The slice reuses the existing project, rail, document-page, selection,
Inspector, and Playwright primitives instead of introducing a parallel editor
or document model.

## Implemented Scope

### Empty Entry

- The default Assets surface remains, but an empty local store now exposes one
  working `프로젝트 만들고 시작` primary action.
- Successful creation reuses the existing project transition and opens the
  Layers surface with the seeded document ready to edit.
- The library CTA routes to the existing Team surface.
- Built-in kit examples are static catalog previews rather than buttons, and
  their copy states that they are examples until installation exists.

### Help And Shortcut Safety

- Help is a real left-rail destination with Korean quick-start steps and only
  shortcuts already implemented by the editor.
- The rail button and `?` toggle the same Help surface and expand a collapsed
  sidebar.
- Global canvas shortcuts now preserve text entry plus native control
  activation/navigation. Layer rows still forward intentional selection
  shortcuts such as Arrow, Delete, and command-modified actions after a user
  selects a layer.

### Active Page Navigation

- Existing `RendererDocument.pages[]` entries are exposed in the Layers
  surface through session-only `activePageId` state.
- Switching pages clears stale selection and scopes the visible layer list,
  canvas paint, comment overlays, Inspector page identity, and page-level Dev
  export review to the active page.
- Pointer hit testing, measurement targets, marquee selection, Select All, and
  Select Same Kind are also constrained to the active page, so overlapping
  coordinates cannot select or mutate a hidden page.
- New rectangles, text, images, and component instances target the active page
  while all-document node counts and component relationships remain intact.
- Active-page switching does not mutate the document and falls back to the
  first valid page after file or saved-version changes.

## Existing Primitives Reused

- `createNewProject`, project transition barriers, and `projectStatus`
- `LeftPanelMode`, the existing rail/sidebar shell, and editor design tokens
- `RendererDocument.pages[]`, `flattenRendererNodes`, and selection clearing
- active-page `pageName`, page export review, comment overlay, and canvas render
  paths
- the repository-owned isolated Playwright CLI runner and storage reset helper

## Deliberate Exclusions

- No separate project dashboard or hosted workspace is added.
- No page create, rename, delete, or reorder mutation is implied by the page
  switcher.
- No Figma board, Figma implementation artifact, or migration output is part of
  the editor-entry work.

## Remaining Product Gaps

1. Page CRUD, page reorder, persistence APIs, undo/redo, and deterministic
   HTTP/MCP commands remain open beyond session-only page switching.
2. The File surface still combines project management, archives, migration,
   libraries, comments, versions, Layers, and Team content in one dense scroll.
3. The declared 1024px comfortable viewport still needs a verified responsive
   or collapse strategy; the current fixed sidebar/Inspector contract remains.
4. Focus return after panel/page transitions and persistent
   server/save/async status presentation still need a dedicated product pass.

## Verification State

Focused Playwright coverage for empty entry, Help/shortcut behavior, and
active-page switching lives in `apps/web/e2e/editor-mvp.spec.ts`.

The repository-owned isolated wrapper passed the three initial cases 3/3 with
no retry, then repeated them five times for 15/15 with no retry. After review
expanded page coverage to canvas pixels, active-page hit testing, and scoped
selection, five focused editor/keyboard cases passed 5/5 without retry; the
editor-state regression passed 115/115. An earlier overlapping
run coincided with `cargo test --workspace` regenerating `ts-rs` bindings and
restarting the watched development server; after serializing Cargo and E2E, the
same browser command stayed green. Keep those two verification lanes sequential.

The first root test run also exposed a wall-clock-dependent authorization test:
its fixture token had expired relative to the current date because authentication
used the real clock. The regression now injects a fixed time inside the token's
validity window. The final local gate passed workspace typecheck, root
`pnpm test` (including 522 passed/47 skipped server tests and 285 web tests),
Rust workspace tests, design rules, the Penpot maturity check, and the production
web build. The build retains the existing large-chunk warning.

The focused command is:

```bash
node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts \
  --grep "empty editor exposes|help works|switches existing document pages" \
  --workers=1 --retries=0 --reporter=line
```

Implementation plan:
`docs/superpowers/plans/2026-08-31-editor-entry-page-navigation.md`.
