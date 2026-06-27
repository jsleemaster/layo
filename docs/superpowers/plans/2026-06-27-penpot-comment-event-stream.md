# Penpot Comment Event Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SSE-based live comment event delivery so open Layo editors refresh comments immediately after another browser, HTTP client, MCP client, or agent mutates comments.

**Architecture:** Keep the existing persisted comment sidecars and HTTP mutation routes as the source of truth. Add a process-local Server-Sent Events stream at `/comments/events`, publish compact comment mutation events after create/reply/resolve/read operations, and subscribe the web editor to refresh the current file's comment threads, notification summary, and activity feed when a matching event arrives. Keep the existing polling loop as a fallback, not the primary delivery path.

**Tech Stack:** Fastify, Server-Sent Events, React, TypeScript, Playwright CLI, Vitest.

---

## Context

Penpot treats comments as part of its realtime collaboration surface, while Layo currently has durable comments, replies, mentions, unread summaries, retained activity, and a browser polling loop. Polling makes external comment writes visible without reload, but it still leaves the `websocket/SSE delivery` maturity gap open. This slice closes the first live-delivery step with SSE on the existing HTTP server. It does not claim external email/push channels or full CRDT-backed comment editing.

## Files

- Modify: `apps/server/src/http.ts`
  - Add `CommentMutationEvent` and an in-memory SSE subscriber set scoped to one server instance.
  - Add `GET /comments/events?viewerId=<id>&fileId=<id>` with `text/event-stream`.
  - Publish one `comment` event after create, reply, resolve, thread-read, and file-read routes.
- Modify: `apps/server/src/http.test.ts`
  - Add live HTTP coverage that opens `/comments/events`, creates a comment, and parses the emitted SSE event.
- Modify: `apps/web/src/document-api.ts`
  - Add `CommentLiveEvent` type and `subscribeToCommentEvents`.
- Modify: `apps/web/src/document-api.test.ts`
  - Add EventSource helper coverage proving the URL, event parsing, and cleanup behavior.
- Modify: `apps/web/src/App.tsx`
  - Subscribe while a current project document is loaded and trigger existing refresh helpers on matching events.
- Modify: `apps/web/e2e/editor-mvp.spec.ts`
  - Add Playwright CLI coverage proving external comment writes update the file panel faster than the 2 second polling fallback.
- Modify docs:
  - `docs/product/penpot-maturity-benchmark.md`
  - `docs/product/team-collaboration-roadmap.md`
  - `docs/product/figma-feature-inventory.md`
  - `docs/superpowers/PLAN_STATUS.md`

## Tasks

### Task 1: Server Comment SSE Stream

- [x] **Step 1: Write failing HTTP test**

Add a test in `apps/server/src/http.test.ts` named `streams comment mutation events to subscribed clients`.

The test starts a real Fastify listener, opens:

```ts
const stream = await fetch(`${baseUrl}/comments/events?viewerId=${encodeURIComponent("사용자")}&fileId=sample-file`);
expect(stream.status).toBe(200);
expect(stream.headers.get("content-type")).toContain("text/event-stream");
```

Then it posts:

```ts
await fetch(`${baseUrl}/files/sample-file/comments`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nodeId: "text-1",
    body: "@사용자 SSE 확인",
    authorName: "디자인 팀",
    mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
  })
});
```

Read chunks until an `event: comment` block appears, parse `data: ...`, and expect:

```ts
expect(event).toMatchObject({
  schemaVersion: 1,
  type: "created",
  fileId: "sample-file",
  viewerId: "사용자"
});
expect(event.threadId).toMatch(/^comment-/);
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "streams comment mutation events"
```

Expected: FAIL with 404 or missing `text/event-stream` because `/comments/events` does not exist.

- [x] **Step 3: Implement minimal server stream**

In `apps/server/src/http.ts`, add a local subscriber set inside `createHttpServer`:

```ts
type CommentMutationEventType = "created" | "replied" | "resolved" | "read";

interface CommentMutationEvent {
  schemaVersion: 1;
  type: CommentMutationEventType;
  fileId: string;
  threadId?: string;
  viewerId?: string;
  createdAt: string;
}
```

Use `reply.hijack()`, `reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })`, an initial `event: ready`, and a heartbeat comment every 25 seconds. Publish compact JSON events from the existing mutation routes after storage writes succeed. Filter subscribers by `fileId` when provided.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @layo/server test -- src/http.test.ts -t "streams comment mutation events"
```

Expected: PASS.

### Task 2: Web EventSource Subscription

- [x] **Step 1: Write failing document API test**

Add a test in `apps/web/src/document-api.test.ts` named `subscribes to live comment events with EventSource`.

Install a fake `globalThis.EventSource`, call:

```ts
const unsubscribe = subscribeToCommentEvents({
  fileId: "sample-file",
  viewerId: "사용자",
  onCommentEvent: (event) => events.push(event)
});
```

Assert the constructed URL contains `/comments/events`, `fileId=sample-file`, and encoded `viewerId`. Dispatch a `MessageEvent("comment", { data: JSON.stringify({ schemaVersion: 1, type: "created", fileId: "sample-file", threadId: "comment-1", viewerId: "사용자", createdAt: "2026-06-27T00:00:00.000Z" }) })`, expect the callback to receive the event, then call `unsubscribe()` and expect the fake source to close.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "subscribes to live comment events"
```

Expected: FAIL because `subscribeToCommentEvents` is not exported.

- [x] **Step 3: Implement EventSource helper**

In `apps/web/src/document-api.ts`, export `CommentLiveEvent` and `subscribeToCommentEvents(options)`. Use `apiUrl("/comments/events?...")`, listen for `comment`, parse JSON, ignore malformed payloads, and return a cleanup function that removes the listener and closes the source. If `EventSource` is unavailable, return a no-op cleanup.

- [x] **Step 4: Wire App subscription**

In `apps/web/src/App.tsx`, import `subscribeToCommentEvents` and add a `useEffect` keyed by `currentProject?.currentDocumentId`. On matching events, call:

```ts
void Promise.all([
  refreshCommentThreads(fileId),
  refreshCommentNotifications(),
  refreshCommentActivity()
]);
```

Keep the existing 2 second polling loop as fallback.

- [x] **Step 5: Verify GREEN**

Run:

```bash
pnpm --filter @layo/web test -- src/document-api.test.ts -t "subscribes to live comment events"
pnpm --filter @layo/web typecheck
```

Expected: PASS.

### Task 3: Browser Proof And Maturity Docs

- [x] **Step 1: Write failing Playwright CLI coverage**

Add `file panel receives externally created comment notifications through the event stream` to `apps/web/e2e/editor-mvp.spec.ts`. After project creation and opening the file panel, wait 100ms so the polling interval is not the immediate delivery path, POST an external comment, and expect the summary/feed to update within `1_200ms`. This is below the 2 second polling fallback and proves event-stream delivery.

- [x] **Step 2: Verify RED**

Temporarily run before App subscription is implemented, or if server is still absent:

```bash
pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "event stream" --workers=1 --reporter=line
```

Expected: FAIL because the UI only has polling fallback.

- [x] **Step 3: Update maturity docs**

Record that Layo now has process-local SSE comment event delivery for open editor sessions. Keep these as open gaps: full CRDT/Yjs comment sync, external notification channels, cross-process/pubsub fanout for deployed multi-instance servers, branch/review/merge, and richer recovery workflows.

- [x] **Step 4: Full verification**

Run:

```bash
git diff --check
pnpm run check:design-rules
pnpm run check:penpot-maturity
pnpm --filter @layo/server test -- src/http.test.ts -t "streams comment mutation events"
pnpm --filter @layo/web test -- src/document-api.test.ts -t "subscribes to live comment events"
pnpm --filter @layo/web build
pnpm typecheck
pnpm test
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 5: Publish and cleanup**

Commit, push, create PR through GitHub REST API, merge after verification, and run the mandatory post-merge cleanup process.

## Verification Notes

- RED server: `pnpm --filter @layo/server test -- src/http.test.ts -t "streams comment mutation events"` failed with 404 before `/comments/events` existed.
- RED web API: `pnpm --filter @layo/web test -- src/document-api.test.ts -t "subscribes to live comment events"` failed because `subscribeToCommentEvents` was not exported.
- RED browser: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "event stream" --workers=1 --reporter=line` first exposed a missing dev-server setup, then failed because the browser received no comment event; root cause was the raw hijacked SSE response missing CORS headers.
- GREEN focused:
  - `pnpm --filter @layo/server test -- src/http.test.ts -t "streams comment mutation events"`
  - `pnpm --filter @layo/web test -- src/document-api.test.ts -t "subscribes to live comment events"`
  - `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "event stream" --workers=1 --reporter=line`
- Full verification:
  - `git diff --check`
  - `pnpm run check:design-rules`
  - `pnpm run check:penpot-maturity`
  - `pnpm --filter @layo/web build`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
