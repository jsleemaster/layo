# Penpot Registry Event Fanout

**Goal:** Close the Penpot-comparable shared-library update delivery gap where
registry publish events were only discoverable by browser polling inside one
server process.

**Penpot reference capability:** Penpot shared libraries are a team product
surface, so library changes need to become visible to other open team files
without a manual reload.

**Layo adaptation:** Keep Layo local-first and team-owned. Add a filesystem
backed registry event log plus an SSE stream that can replay new publish events
to any server instance sharing the same `.layo` storage. This closes
same-host/shared-storage fanout while leaving hosted durable pub/sub and
central auth as a later operations gap.

## Implementation

- Storage writes `libraries/registry-events.json` whenever a library is
  published or republished.
- Events carry a monotonically increasing `sequence`, registry timestamp,
  source file metadata, counts, and optional source `teamId`.
- `listLibraryRegistryEvents({ fileId, after })` replays only events visible to
  the target file's team.
- `GET /libraries/events` streams `library-registry` SSE blocks by polling the
  shared event log.
- The web document API exposes `subscribeToLibraryRegistryEvents`.
- The file panel subscribes to current-file registry events and refreshes
  registry update notifications immediately, with the existing polling kept as
  fallback.

## RED Evidence

- `pnpm --filter @layo/server exec vitest run src/storage.test.ts -t "library registry events are durable"` failed because `listLibraryRegistryEvents` did not exist.
- `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "streams library registry events"` failed with `404` for `/libraries/events`.
- `pnpm --filter @layo/web exec vitest run src/document-api.test.ts -t "subscribes to live library registry events"` failed because `subscribeToLibraryRegistryEvents` did not exist.
- `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "file panel publishes imports and updates a shared library registry item" --workers=1 --reporter=line` failed waiting for a `/libraries/events` EventSource URL while polling was suppressed.

## GREEN Evidence

- `pnpm --filter @layo/server exec vitest run src/storage.test.ts -t "library registry events are durable"`
- `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "streams library registry events"`
- `pnpm --filter @layo/web exec vitest run src/document-api.test.ts -t "subscribes to live library registry events"`
- `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "file panel publishes imports and updates a shared library registry item" --workers=1 --reporter=line`
- `pnpm run check:penpot-maturity`
- `pnpm run check:design-rules`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `cargo test -p editor-core`
- `pnpm test`
- `pnpm test:e2e` with 144 passing tests
- `git diff --check`

## Remaining Risks

- This is not hosted multi-region pub/sub. It requires server instances to share
  the same filesystem-backed `.layo` store.
- The event log currently appends without a cross-process file lock. That is
  acceptable for the local/team-owned slice but not enough for hosted
  production registry sync.
- Hosted durable auth, backup/restore runbooks, and Penpot/Figma migration paths
  remain separate maturity gaps.
