# Penpot Open Path Flattening and Stroke Outline Plan

**Goal:** Extend first-class path Flatten to open paths while preserving visible stroke geometry, caps, joins, dash patterns, and endpoint markers across editor, agent, and artifact surfaces.

**Benchmark decision:** Adapt Penpot's path and stroke behavior. Open paths must not be silently closed or treated as filled shapes; Layo will convert their visible stroke semantics into deterministic standalone geometry or preserve an explicit supported stroke contract.

References:

- https://help.penpot.app/user-guide/designing/layers/
- https://help.penpot.app/user-guide/designing/color-stroke/

## Task 1: Exact RED cases

- [x] Add open line, cubic curve, dash, cap, join, and marker fixtures.
- [x] Prove current `flatten_path` rejection and artifact gaps.

## Task 2: Model and evaluator

- [x] Define deterministic open-path flatten semantics without invented fill regions.
- [x] Preserve world bounds, transforms, stroke appearance, and style ownership.
- [x] Keep invalid or unsupported cases no-write.

## Task 3: Agent and editor workflow

- [x] Extend MCP/HTTP dry-run/apply and validation/change summaries.
- [x] Add Korean-first controls, history, reload, and direct Playwright CLI proof.
- [x] Verify SVG and canvas/PNG fidelity plus PDF cap/join/dash output; route visual PDF endpoint markers as the next exact gap.

## Task 4: Close and route

- [x] Run final full verification and record failure learning.
- [x] Review the implementation, update the benchmark, and route the next exact Penpot gap; merge and cleanup follow after the final docs-only gate.
