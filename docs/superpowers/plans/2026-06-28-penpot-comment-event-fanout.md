# Penpot Comment Event Fanout

**Goal:** Move Layo comment live updates beyond process-local SSE so open editor
sessions can receive comment changes written by another server instance that
shares the same `.layo` storage.

**Penpot reference:** Penpot treats comments as a team collaboration capability,
not a single-browser convenience. Layo adapts this to its local-first model with
shared-filesystem durable event replay before hosted pub/sub exists.

## Implementation

1. Add bounded durable comment live events to comment sidecar storage.
2. Append `created`, `replied`, `read`, and `resolved` live events whenever the
   corresponding storage mutation succeeds.
3. Change `GET /comments/events` from process-local subscriber delivery to
   storage-backed replay with sequence cursors and SSE polling.
4. Expose `eventId`, `sequence`, and `after` in the web EventSource helper.
5. Track the latest per-file comment event sequence in the app before
   refreshing comments, notifications, and activity.

## Verification

- RED: `pnpm --filter @layo/server exec vitest run src/storage.test.ts -t "comment live events are durable"` failed before `listCommentLiveEvents` existed.
- GREEN: `pnpm --filter @layo/server exec vitest run src/storage.test.ts -t "comment live events are durable"`
- RED: `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "streams comment mutation events from a shared storage event log"` timed out before `/comments/events` replayed storage events.
- GREEN: `pnpm --filter @layo/server exec vitest run src/http.test.ts -t "streams comment mutation events"`
- RED: `pnpm --filter @layo/web exec vitest run src/document-api.test.ts -t "subscribes to live comment events"` failed because `after` was missing from the EventSource URL.
- GREEN: `pnpm --filter @layo/web exec vitest run src/document-api.test.ts -t "subscribes to live comment events"`
- GREEN: `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "file panel receives externally created comment notifications through the event stream" --workers=1 --reporter=line`
- Full E2E initially failed 4 comment tests because local create/reply success
  status messages were overwritten by the new background EventSource refresh.
  The fix keeps EventSource-triggered thread refreshes from mutating
  `commentStatus` while still refreshing threads, notifications, and activity.
- GREEN: `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "comments panel creates and resolves a selected-layer thread" --workers=1 --reporter=line`
- GREEN: `node scripts/run-e2e.mjs -- apps/web/e2e/editor-mvp.spec.ts --grep "comments panel adds replies|file panel shows retained recent comment activity|canvas comment bubbles" --workers=1 --reporter=line`
- GREEN: `pnpm test:e2e` with 144 passing tests.

## Remaining Gaps

Hosted durable pub/sub, full CRDT-backed live comment editing, external
notification channels, visual comment review workflows, and branch/review/merge
remain outside this slice.
