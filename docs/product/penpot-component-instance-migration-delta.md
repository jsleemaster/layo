# Penpot Component Instance Migration Delta

**Date:** 2026-07-13  
**PR:** #282  
**Maturity gate:** Design systems, import/export, developer handoff, agent safety

## Benchmark Decision

- **Adopt:** Penpot main-component and linked-copy ownership through
  `main-instance`, `component-root`, `component-id`, and `shape-ref`.
- **Adapt:** Penpot variant containers and property combinations become one
  Layo component definition with deterministic native variants.
- **Adapt:** Supported `touched` groups become Layo instance overrides for
  text, fill stacks, stroke stacks and width, opacity, and child geometry.
- **Diverge deliberately:** missing, duplicate, or ambiguous roots and connected
  layers block review and import instead of producing flattened or invented
  ownership.

Official references:

- https://help.penpot.app/user-guide/design-systems/components/
- https://help.penpot.app/user-guide/design-systems/variants/
- https://github.com/penpot/penpot/blob/develop/.serena/memories/common/component-data-model.md

## Product Delta

Supported same-package Penpot files now preserve:

- main roots as native `component` nodes and deterministic definitions;
- linked copies as `component_instance` trees rebuilt from their selected
  source, with stable source-derived child ids;
- variant containers as one definition with property/value combinations and
  selected variant ids;
- text, fill/fills, stroke/strokes/stroke width, opacity, x/y, and width/height
  overrides without losing imported paint assets;
- review-time no-write blockers for dangling or duplicate main relations and
  unresolved or duplicate connected-layer references;
- HTTP persistence, agent inspection and validation, and structured code
  handoff for imported ownership.

The browser proof uploads a real packaged Penpot fixture, reviews it, imports it
through the Korean file panel, selects `Button copy`, observes x=320 and
width=180 in the Inspector, and verifies the persisted linked instance and
`Continue` text override.

## Failure Learning

- **Flattened ownership:** the importer mapped all Penpot roots as frames because
  it had no relationship pass after geometry mapping. A post-map ownership pass
  now creates definitions and rebuilds copies from source trees.
- **Split variants:** grouping by `component-id` made each variant an unrelated
  definition. Grouping now uses `variant-id` and keeps each component id as a
  selectable native variant.
- **Visual override loss:** initial coverage proved only text. Focused RED
  coverage exposed fill loss, then expanded the contract to stroke, opacity,
  and geometry before completion.
- **Partial connected layers:** root validation did not prove child
  `shape-ref` ownership. Review now blocks unresolved or duplicate connected
  layer relations before writes.
- **Validation test assumption:** the HTTP test assumed a non-existent
  `validation.valid` flag. It now asserts the established `issues` contract.
- **Remote test edit closure:** an intermediate remote edit misplaced a test
  closure. It was corrected before implementation and the CI typecheck remains
  the syntax gate.

No memory note was added: these were repository-local migration and response
contract gaps, now captured by focused tests, this delta, the active plan, and
the PR body.

## Verification

- Initial ownership RED: Full Verification `29240718967`, server 1 failed /
  253 passed because `file.components` was absent.
- Variant RED: `29241301919`, server 1 failed / 254 passed because variants
  became separate default definitions.
- Dangling-root RED: `29241748384`, review incorrectly returned
  `canImport: true`.
- Fill override RED: `29242451060`, the imported copy retained source paint.
- Failure-learning run `29242734727`: all product assertions reached the HTTP
  validation assertion, exposing the incorrect `valid` assumption.
- Final code-head Full Verification `29243082186`: maturity/design gates,
  typecheck, web build, 250 web tests, 258 server tests, Rust workspace tests,
  and 191 Playwright CLI cases passed. The direct component import interaction
  ran as case 175/191.

## Remaining Gap

This slice intentionally blocks external `component-file` references whose
main source is not packaged and does not preserve nested component-swap
overrides or imported shared-library ownership. The next maturity-loop goal is
`2026-07-13-penpot-component-library-swap-migration.md`.
