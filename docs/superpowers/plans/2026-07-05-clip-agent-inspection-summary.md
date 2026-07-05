# Clip Agent Inspection Summary

## Goal

Close the next Penpot maturity-loop gap from the masked-group clipping slice: AI agent inspection summaries must expose the same deterministic bounds-clipping metadata that persistence, selected-layer SVG artifacts, and code export already carry.

## Penpot Reference

- Source: https://github.com/penpot/penpot
- Source: docs/product/penpot-mask-clipping-benchmark-delta.md
- Reference capability: masked-group clipping intent should remain inspectable after import, not only visible in browser or code handoff output.
- Decision: adapt. Layo keeps the existing local-first document model and exposes the first safe subset as `clip: { type: "bounds" }` in agent summaries.
- Maturity gate: agent-control and developer handoff.

## Minimal-Change Ladder

1. Confirm behavior: PR #241 stored and exported `clip`, but `inspectCanvas` summaries omitted it.
2. Reuse local patterns: keep the existing summary fields and filtering behavior, adding only optional `clip` metadata.
3. Prefer existing primitives: reuse the established `clip: { type: "bounds" }` subset instead of adding mask geometry in this slice.
4. Implement narrowly: enrich `inspectCanvas`, `findNodes`, and batch inspection output without changing document mutation commands.
5. Preserve validation: add a focused server regression around the Penpot clipped masked-group import and agent inspection surface.

## Failure Mode

Repair Full Verification #28730992728 for PR #241 failed Core tests when the clipping test overreached into agent inspection summaries. That was the correct next maturity-loop case: the imported document had `clip`, but `AgentNodeSummary` did not expose it.

## RED Evidence

The failed case expected `inspectCanvas(imported.file).nodes` to include `clip: { type: "bounds" }` for the imported masked group. The old summary only returned identity, text, component, layout, constraints, export presets, and bounds.

Local RED execution could not be rerun in this Codex session because every shell command exits with code 134 before producing output. The regression is anchored to the already-recorded CI failure above and reintroduced as a focused server test in this branch.

## Implementation

- Preserves the previous agent-control implementation as `agent-control-base.ts` so the remote patch does not need to reconstruct a large file by hand.
- Re-exports the base agent-control API from `agent-control.ts`.
- Overrides `inspectCanvas`, `findNodes`, and `createAgentBatchResult` so node summaries include optional `clip: { type: "bounds" }` when present on a design node.
- Adds server regression coverage to the Penpot masked-group clipping test so persistence, agent inspection, and code handoff all assert the same clipping signal.

## GREEN Evidence

Code-head Full Verification #28731905701, job #85199031296, passed:

- Penpot maturity and design rule gates.
- Typecheck.
- Web build.
- Core tests, including the server regression for `inspectCanvas` clip summaries.
- Playwright CLI e2e.

The Playwright CLI e2e suite ran the existing clipped masked-group browser scenario at `[159/177]` as `apps/web/e2e/external-migration-penpot-masked-group.spec.ts`, and the final result was `177 passed (5.9m)`.

## Direct Browser Evidence

No new browser behavior is introduced in this slice. Browser-level proof remains the existing Playwright CLI e2e path from PR #241 and this PR's full-suite rerun: it imports a Penpot masked group through the visible file panel, checks the Korean import status and layer tree, and verifies persisted project JSON includes `clip: { type: "bounds" }` on the imported group.

## Remaining Divergence

- Arbitrary Penpot mask paths, alpha masks, and exact blend/compositing fidelity remain follow-up import/export gaps.
- Components, variants, tokens, and library relations remain broader Penpot import/export maturity gaps.

## Deployment

Deployment remains intentionally deferred.
