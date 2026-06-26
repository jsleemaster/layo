# Penpot Comment Bubbles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before implementation. Keep this slice small and verify the visible browser behavior with Playwright CLI.

**Goal:** Close the next Penpot comments gap by showing unresolved selected-node comment threads as canvas viewport bubbles, so comments are visible in-context instead of only inside the right Inspector.

**Reference:** Penpot workspace comments are anchored to design context and visible from the workspace, not hidden exclusively in an inspector panel.

---

## Failure Case

After creating a comment on `text-1`, Layo stores and lists the thread, but the canvas gives no visual indication that the object has an active unresolved comment. Users must already know to select the node and inspect the right panel.

## Acceptance Criteria

- [x] Creating a selected-node comment renders one canvas bubble anchored to that node.
- [x] The bubble count reflects active unresolved threads for that node.
- [x] Clicking a bubble selects the commented node and reveals the existing Inspector comment thread list.
- [x] Resolving the final active thread removes the bubble.
- [x] Resolved threads do not render viewport bubbles.
- [x] Browser behavior is covered with Playwright CLI.

## Implementation Notes

- Reuse existing comment sidecar storage and `listCommentThreads` output.
- Keep comments local-first for this slice; do not add replies, mentions, unread state, or live relay sync yet.
- Build the overlay from current document geometry with existing `getNodeBounds`, `findNodeById`, and `documentPointToViewport` helpers.
- Render DOM controls above the Konva stage so they are accessible buttons and do not require new canvas hit testing.

## Verification

- RED: `pnpm exec playwright test apps/web/e2e/editor-mvp.spec.ts -g "canvas comment bubbles open selected-layer threads and disappear after resolve" --workers=1 --reporter=line`
- GREEN: same command passes after implementation.
- Broad checks to run before merge:
  - `pnpm --filter @layo/web typecheck`
  - `pnpm run check:penpot-maturity`
  - `pnpm --filter @layo/web build`
  - `pnpm test`
  - `pnpm test:e2e`
  - `git diff --check`
