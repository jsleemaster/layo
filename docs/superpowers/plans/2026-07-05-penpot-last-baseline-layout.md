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

## Status

Implemented through the Penpot maturity loop after deployment was explicitly deferred.
