# Penpot Library Mutation Authorization Delta

Date: 2026-07-14  
Status: In progress in PR #296

## Product Change

When `LAYO_LIBRARY_REGISTRY_MEMBERS` is configured, the following target-file
writes require an authenticated owner or editor assigned to the exact target
team:

- component/token library import;
- token-bundle replacement import;
- subscribed component/token library update;
- subscribed token-bundle update.

HTTP, web API helpers, the live editor, and MCP apply the same target-team
policy before storage mutation. Review/preflight routes remain readable by
viewers. Browser credentials stay bound to the activated collaboration session,
MCP credentials remain process-local, and unconfigured local-first servers
preserve their existing open workflow.

## Evidence

- RED `29286183142`: viewer registry import returned 200 and could write target
  subscription state instead of returning 403.
- GREEN and direct Playwright evidence: pending.

## Deliberate Remaining Gaps

This delta does not authenticate registry list/event/read visibility. Hosted
principal-filtered reads, credential rotation/revocation, shared transactional
storage, receipt retention, durable pub/sub, and backup automation remain open.
