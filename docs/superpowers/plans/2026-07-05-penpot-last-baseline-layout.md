# Penpot Last Baseline Layout

## Goal

Close the Penpot/CSS baseline-alignment gap where Layo supported first-baseline groups but could not model last-baseline groups for auto layout, grid, Inspector controls, MCP/HTTP contracts, and code export.

## Reference

- Penpot flexible layouts: https://help.penpot.app/user-guide/designing/flexible-layouts/
- CSS Box Alignment Level 3 baseline-position grammar: https://www.w3.org/TR/css-align-3/#baseline-values

## Decision

Adapt the CSS `last baseline` concept into Layo's snake_case document model as `last_baseline`. Export maps it back to CSS `last baseline`. This keeps saved files and MCP/HTTP command payloads deterministic while preserving web handoff semantics.

## Verification Plan

- Web state tests cover horizontal auto-layout and grid row last-baseline placement.
- Server layout tests cover the same geometry through the storage-side relayout engine.
- Code-export tests cover `last_baseline` to CSS `last baseline` handoff.
- Playwright e2e covers the Inspector control exposing and persisting first/last baseline options.
- Full Verification remains the merge gate.

## Failure Follow-up

Automated review found that the initial slice modeled last-baseline grouping but missed CSS's end fallback for `last baseline`, and also missed regenerated Rust TypeScript binding files for the new enum values. The follow-up keeps first and last baseline groups separate, shifts last-baseline groups to the cross-end fallback when extra cross-axis space exists, updates generated bindings, and changes the geometry regression tests to fail on the original start-anchored behavior.

## Review Resolution

- `last_baseline` now keeps first-baseline and last-baseline sharing groups separate.
- Last-baseline auto-layout and grid groups use the CSS end fallback when the available cross-axis space is larger than the baseline group.
- `LayoutAlignItems` and `LayoutSelfAlignment` ts-rs binding artifacts include `last_baseline`.

## Status

Implemented through the Penpot maturity loop after deployment was explicitly deferred.
