# Superpowers Plan Status

Last audited: 2026-06-17

This file is the routing source of truth for `docs/superpowers/plans/*`.
The individual plan files are historical execution plans. Some older files still
contain unchecked task boxes even though their goals have since been implemented
and merged. Do not restart a historical plan only because its original checkboxes
were not backfilled.

Use this order when entering the repo:

1. Read `AGENTS.md` for current agent operating rules.
2. Read `docs/PROJECT_BRIEF.md` for the product summary.
3. Read this file before treating any individual plan as active work.
4. Open the specific plan only for implementation details or historical context.

## Completed Plans

| Plan | Status | Evidence |
| --- | --- | --- |
| `2026-06-16-rust-design-editor-foundation.md` | Completed, historical | Foundation commits are present in main: workspace scaffold, Rust document model, editor commands/context, Fastify/MCP server, renderer package, and Vite web shell. Current `pnpm test` and `pnpm typecheck` cover this baseline. |
| `2026-06-16-editor-mvp-interactions.md` | Completed, historical | Merged in PR #2, `9f48772`, with editor interaction coverage now in `apps/web/src/editor-state.test.ts`, server HTTP tests, Rust command tests, and Playwright editor e2e. |
| `2026-06-16-component-system-mvp.md` | Completed, historical | Merged in PR #3, `4a0e443`, with component definitions, component instances, detach support, HTTP/MCP surfaces, and Playwright coverage. |
| `2026-06-16-agent-control-mvp.md` | Completed, historical | Merged in PR #4, `8fb216b`, with `inspect_canvas`, `find_nodes`, `apply_agent_commands`, `validate_document`, `get_change_summary`, HTTP agent routes, and Playwright verification. |
| `2026-06-16-code-export-mvp.md` | Completed | Merged in PR #5, `feacf11`, with `export_code` and `GET /files/:fileId/export/code`. |
| `2026-06-16-component-abstraction-export.md` | Completed | Merged in PR #6, `82be355`, with structured `implementationSpec`, component references, implementation hints, and README documentation. |
| `2026-06-16-team-collaboration-foundation.md` | Completed, historical | Merged in PR #7, `277c2b9`, with the collaboration package, team store/session flow, TypeScript relay workflow, collaborative agent command path, and collaboration e2e coverage. |
| `2026-06-16-deployment-automation.md` | Completed, historical | Merged in PR #8, `3d824bc`, with `.github/workflows/web-static.yml`, relay Docker artifacts, deployment docs, and artifact tests. |
| `2026-06-16-collaboration-auth-permissions.md` | Completed, historical | Merged in PR #9, `87069a6`, with member roles, relay token hashes, owner/editor/viewer authorization, runtime credentials, and docs. Final verification boxes in the plan are stale; the current suite passed during the 2026-06-17 audit. |
| `2026-06-16-remote-cursors-selection.md` | Completed, historical | Merged in PR #10, `287b38b`, with presence session ids, cursor/selection bounds, overlay utilities, UI rendering, and collaboration e2e assertions. |
| `2026-06-17-team-manifest-management.md` | Completed | Merged in PR #11, `691aff6`, with manifest migration/validation, file import/export, URL import, UI status handling, and e2e coverage. |
| `2026-06-17-collaboration-e2ee.md` | Completed | Merged in PR #12, `03297dd`, with manifest encryption metadata, crypto helpers, encrypted relay mode, encrypted web provider, UI, docs, and e2e coverage. |
| `2026-06-17-rust-collab-relay.md` | Completed | Merged in PR #13, `b02fa10`, with Rust frame codec, auth/config, room hub, Axum runtime, scripts, tests, and docs. |
| `2026-06-17-web-only-laptop-layout.md` | Completed | Merged in PR #14, `a09a93e`, with laptop viewport overflow regression coverage and hidden input sizing fix. |
| `2026-06-17-figma-layout-foundation.md` | Completed | Implemented after the 2026-06-17 Figma feature audit with optional layout/constraints metadata, auto layout stacking, parent-resize constraints, inspector controls, MCP/HTTP agent command support, code-export metadata, and Playwright coverage. Verified with `pnpm test`, `pnpm typecheck`, `cargo test --workspace`, `pnpm --filter @canvas-mcp-editor/web build`, `pnpm test:e2e`, and `pnpm test:e2e:collab`. |
| `2026-06-17-mcp-ai-editing-verification.md` | Completed | Added MCP client integration coverage using `InMemoryTransport`, verified `inspect_canvas`, `apply_agent_commands`, `find_nodes`, and `validate_document`, added read/write tool annotations for AI clients, and added Playwright CLI coverage for stdio MCP node move, component creation, instance creation, and visible editor inspector state. `test:e2e` now runs shared local-file e2e specs with `--workers=1` to avoid sample-file reset races. Verified with `pnpm --filter @canvas-mcp-editor/server test -- src/mcp.test.ts`, `pnpm exec playwright test apps/web/e2e/mcp-stdio.spec.ts --reporter=line`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm test`, and `pnpm --filter @canvas-mcp-editor/web build`. |

## Current Active Plan

There is no active implementation plan left under `docs/superpowers/plans` as
of this audit. New feature work should start from a new plan or spec instead of
resuming any historical plan above.

## Handoff Plan

PR #15, `dc090c8`, added `AGENTS.md` and `docs/PROJECT_BRIEF.md`. Those files
summarize the implemented product state and should be treated as the current
agent handoff layer.

For Figma parity work, read `docs/product/figma-feature-inventory.md` and
`docs/product/figma-migration-roadmap.md` before creating or resuming a plan.
