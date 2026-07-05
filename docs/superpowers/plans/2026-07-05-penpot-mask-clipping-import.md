# Penpot Mask Clipping Import

## Goal

Close the next Penpot import/export maturity gap from the masked-group slice: imported Penpot masked groups should preserve a first clipping primitive instead of only preserving the group tree with an unclipped warning.

## Penpot Reference

- Source: https://github.com/penpot/penpot
- Source: https://github.com/penpot/penpot/blob/main/common/src/app/common/files/helpers.cljc
- Source: https://github.com/penpot/penpot/blob/main/frontend/src/app/main/ui/shapes/mask.cljs
- Reference capability: Penpot is a self-hostable team design platform, and its masked groups keep grouped children while rendering through mask/clip behavior.
- Decision: adapt. Layo will preserve a deterministic `clip: { type: "bounds" }` primitive for masked group containers, selected-layer SVG artifacts, and code handoff. Layo will not claim arbitrary mask-path, alpha-mask, or exact compositing fidelity in this slice.
- Maturity gate: import/export plus developer handoff.

## Minimal-Change Ladder

1. Confirm behavior: the previous masked-group import preserved children but explicitly warned that clipping was not preserved.
2. Reuse local patterns: keep the existing Penpot ZIP import wrapper, warning plumbing, selected-layer SVG artifact helpers, and code-export structure/CSS surfaces.
3. Prefer existing primitives: use bounds clipping before adding a full vector/alpha mask model.
4. Implement narrowly: add optional `clip` metadata, set it only for Penpot masked groups, and surface it through handoff paths that already serialize node structure.
5. Preserve validation: add focused server, web artifact, and Playwright CLI e2e coverage instead of treating the TypeScript type addition as enough evidence.

## Failure Mode

PR #240 adapted Penpot masked groups from unsupported skipped shapes into Layo group containers. That closed structure loss but still left oversized children visible outside the masked-group bounds and left code handoff without any clipping signal.

The first RED test for this slice deliberately expected `clip: { type: "bounds" }` before `RendererNode` supported that metadata.

## RED Evidence

Full Verification #28730602500 failed in Typecheck on PR #241 because `apps/web/src/node-artifacts-clip.test.ts` used `clip` on `RendererNode` before the renderer contract defined it.

Repair Full Verification #28730992728 then passed Penpot maturity/design gates, Typecheck, and Web build, but failed Core tests for two focused reasons:

- The older masked-group test still expected the old unclipped warning.
- The new clipping test overreached by expecting agent inspection summaries to expose `clip`; `apps/server/src/agent-control.ts` still needs a separate safe patch for that surface.

## Implementation

- Adds optional `NodeClip` / `clip?: { type: "bounds" }` metadata to renderer-facing nodes.
- Updates Penpot ZIP import to find `maskedGroup` / `masked-group` group records and mark the imported group node as bounds-clipped.
- Replaces the old unclipped warning with a narrower warning: bounds clipping is preserved, complex mask shapes are not.
- Preserves `clip` in structured code export and adds `overflow: hidden;` to generated CSS for clipped nodes.
- Adds selected-layer SVG artifact `clipPath` output and keeps clipped group artifacts bounded to the group size.
- Updates the visible file-panel Penpot import e2e so the masked group contains an oversized child and persists the bounds-clip metadata.

## GREEN Evidence

Code-head Full Verification #28731065239, job #85196617567, passed:

- Penpot maturity and design rule gates.
- Typecheck.
- Web build.
- Core tests.
- Playwright CLI e2e.

Documentation-head Full Verification #28731268949, job #85197197280, also passed the same gate sequence. The Playwright CLI e2e suite ran the clipping import scenario at `[159/177]` as `apps/web/e2e/external-migration-penpot-masked-group.spec.ts`, and the final result was `177 passed (6.0m)`.

## Direct Browser Evidence

The Playwright CLI e2e path for this slice uses the visible file panel to import a `.penpot` package, waits for the Korean import status, inspects the layer panel for the masked group and oversized child, and verifies the persisted project/file JSON served by the local API includes `clip: { type: "bounds" }` on the imported group.

## Remaining Divergence

- Agent inspection summaries do not yet expose `clip`; the next focused loop item should add `clip` to `AgentNodeSummary` and regression coverage around `inspectCanvas`.
- Arbitrary Penpot mask paths, alpha masks, blend/compositing fidelity, components, variants, tokens, and library relations remain follow-up import/export gaps.

## Deployment

Deployment is intentionally deferred. Vercel rate limiting is not the acceptance gate for this maturity slice.
