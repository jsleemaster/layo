# Penpot Library Registry Sync

**Goal:** Narrow the Penpot design-system/library gap by adding a team-owned published library registry that lets one Layo file publish reusable components and tokens, then lets another project review and import that latest published library.

**Penpot reference:** Penpot treats reusable design assets and shared libraries as first-class team design-system infrastructure. Layo adapts that capability to its current local/team-owned storage model instead of pretending to have hosted multi-team library subscriptions.

**Architecture:** Reuse the existing `.layo-library.zip` export/review/import path as the canonical package format. Store the latest published archive per library id under `.layo/libraries/`, keep a registry manifest with source metadata and counts, expose storage and HTTP APIs, add web API helpers, and add visible file-panel controls for publish, list, review, and import.

**Tech Stack:** TypeScript storage, Fastify HTTP routes, React/Vite web UI, Vitest, Playwright CLI.

## Scope

- Publish the current file's reusable library to a stable registry id.
- List published libraries with source name, counts, and published timestamp.
- Review a published library before importing into the current file.
- Import the reviewed library through the same component/token remapping contract as `.layo-library.zip`.
- Verify the real web flow from source project publish to target project import.

## Intentional Non-Scope

- Live library subscription/update notifications.
- Permissioned hosted multi-team registry sync.
- External Penpot/Figma migration.
- Plugin marketplace or external package distribution.

## RED Evidence

- `pnpm --filter @layo/server test -- src/storage.test.ts -t "library registry"` failed with `storage.publishLibraryToRegistry is not a function`.
- `pnpm --filter @layo/server test -- src/http.test.ts -t "registry libraries"` failed because `POST /libraries` returned 404.
- `pnpm --filter @layo/web test -- src/document-api.test.ts -t "registry libraries"` failed because `publishLibraryToRegistry` did not exist.
- `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts -g "shared library registry" --workers=1 --reporter=line` failed because the file-panel registry controls did not exist.

## GREEN Evidence

- `pnpm --filter @layo/server test -- src/storage.test.ts -t "library registry"` passed with 7 files and 146 tests.
- `pnpm --filter @layo/server test -- src/http.test.ts -t "registry libraries"` passed with 7 files and 146 tests.
- `pnpm --filter @layo/web test -- src/document-api.test.ts -t "registry libraries"` passed with 15 files and 171 tests.
- `node scripts/run-e2e.mjs apps/web/e2e/editor-mvp.spec.ts -g "shared library registry" --workers=1 --reporter=line` passed with 1 Playwright test.

## Full Verification

- `pnpm run check:design-rules`
- `pnpm run check:penpot-maturity`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `cargo test -p editor-core`
- `pnpm test`
- `pnpm test:e2e` passed with 142 Playwright CLI tests.
- `git diff --check`

During full e2e, the first run exposed an accessible-name collision because the
new registry refresh button contained the generic `새로고침` label used by an
older file-version test. The button was renamed to `게시 목록 갱신`, the failing
file-version case was rerun green, the registry case was rerun green, and the
full e2e suite was rerun green.

## Remaining Gap

This closes the local/team-owned published library registry slice. Penpot-comparable maturity still needs MCP registry tools, live library subscription/update notifications, permissioned hosted registry sync, cross-process deployment storage, and external migration paths.
