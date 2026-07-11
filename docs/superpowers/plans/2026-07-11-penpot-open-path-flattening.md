# Penpot Open Path Flattening and Stroke Outline Plan

**Goal:** Extend first-class path Flatten to open paths while preserving visible stroke geometry, caps, joins, dash patterns, and endpoint markers across editor, agent, and artifact surfaces.

**Benchmark decision:** Adapt Penpot's path and stroke behavior. Open paths must not be silently closed or treated as filled shapes; Layo will convert their visible stroke semantics into deterministic standalone geometry or preserve an explicit supported stroke contract.

References:

- https://help.penpot.app/user-guide/designing/layers/
- https://help.penpot.app/user-guide/designing/color-stroke/

## Task 1: Exact RED cases

- [ ] Add open line, cubic curve, dash, cap, join, and marker fixtures.
- [ ] Prove current `flatten_path` rejection and artifact gaps.

## Task 2: Model and evaluator

- [ ] Define deterministic open-path flatten semantics without invented fill regions.
- [ ] Preserve world bounds, transforms, stroke appearance, and style ownership.
- [ ] Keep invalid or unsupported cases no-write.

## Task 3: Agent and editor workflow

- [ ] Extend MCP/HTTP dry-run/apply and validation/change summaries.
- [ ] Add Korean-first controls, history, reload, and direct Playwright CLI proof.
- [ ] Verify SVG/PDF/PNG and canvas fidelity.

## Task 4: Close and route

- [ ] Run full verification and record failure learning.
- [ ] Review, merge, clean branches/worktrees, update benchmark, and route the next exact Penpot gap.
