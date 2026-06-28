# Penpot Library Registry MCP

**Goal:** Close the MCP side of the Penpot-inspired shared-library registry gap
so agents can publish, list, review, and import team libraries without going
through the web file panel or HTTP-only API surface.

**Penpot reference:** Penpot treats reusable design assets and shared libraries
as first-class team design-system infrastructure. Layo adapts that expectation
to deterministic MCP tools backed by the already-landed server-local registry.

## Scope

- Add MCP tools for publishing the current document's components/tokens into
  the local registry.
- Add MCP list/review/import tools that reuse storage's no-write review and
  conflict-remapping import behavior.
- Keep hosted permissioned registry sync, live library update subscriptions,
  cross-process storage, and external Penpot/Figma migration out of this slice.

## RED

- `pnpm --filter @layo/server test -- src/mcp.test.ts -t "library registry|registry libraries|safety annotations"` failed before implementation.
- Expected failure: `list_library_registry` was not advertised in `listTools()`.
- Expected failure: `publish_library_registry_item` returned an MCP unknown-tool
  error, proving the functional test was exercising the missing MCP surface.

## GREEN

- `pnpm --filter @layo/server exec vitest run src/mcp.test.ts -t "library registry|registry libraries|safety annotations"` passed with 2 focused MCP tests.

## Implementation Notes

- `publish_library_registry_item` wraps `FileStorage.publishLibraryToRegistry`.
- `list_library_registry` wraps `FileStorage.listLibraryRegistry`.
- `review_library_registry_item` wraps `FileStorage.reviewLibraryRegistryItem`.
- `import_library_registry_item` wraps `FileStorage.importLibraryRegistryItem`.
- Tool annotations match the mutation model: list/review are read-only;
  publish/import are write tools.

## Verification

- [x] RED MCP coverage observed before implementation.
- [x] Focused GREEN MCP coverage after implementation.
- [x] `pnpm --filter @layo/server exec vitest run src/mcp.test.ts`
- [x] `pnpm run check:penpot-maturity`
- [x] `pnpm run check:design-rules`
- [x] `pnpm typecheck`
- [x] `pnpm --filter @layo/web build`
- [x] `cargo test -p editor-core`
- [x] `pnpm test`
- [x] `pnpm test:e2e` with 142 passing Playwright CLI tests.
- [x] `git diff --check`
- [x] PR merge and worktree cleanup evidence.

## Merge And Cleanup Evidence

- PR #183, `https://github.com/jsleemaster/layo/pull/183`, was squash-merged
  into `main` as `11160c2165da3703c6afc4fdc1337befac9f4dde`.
- Local `main` was fast-forwarded to `11160c2`.
- The feature worktree at
  `/Users/leeo/jsleemaster/layo/.worktrees/penpot-library-registry-mcp` was
  removed.
- The local and remote `codex/penpot-library-registry-mcp` branches were
  deleted.

## Remaining Gaps

This closes the MCP registry-tool slice. Penpot-comparable maturity still needs
live library subscription/update notifications, permissioned hosted registry
sync, cross-process deployment storage, backup/restore runbooks, and external
Penpot/Figma migration paths where feasible.
