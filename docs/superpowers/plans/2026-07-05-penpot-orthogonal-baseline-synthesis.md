# Penpot Orthogonal Baseline Synthesis

## Goal

Close the Penpot/CSS baseline-alignment gap where vertical writing-mode text in a horizontal auto-layout row or grid row used a width/2 centerline heuristic instead of the synthesized border-edge baseline expected for orthogonal baseline groups.

## Reference

- Penpot flexible layouts: https://help.penpot.app/user-guide/designing/flexible-layouts/
- CSS Box Alignment Level 3 synthesized baselines: https://www.w3.org/TR/css-align-3/#baseline-values
- CSS Writing Modes Level 4 text baselines: https://www.w3.org/TR/css-writing-modes-4/#text-baselines

## Decision

Adapt the CSS synthesized-baseline rule for Layo's current horizontal flex/grid baseline groups. When a `vertical_rl` or `vertical_lr` text node participates in a horizontal row baseline group, Layo now synthesizes the baseline from the block-end border edge by using the node height. This deliberately does not claim full font-specific baseline metrics or every axis-specific orthogonal case; those remain benchmark risks.

## Minimal Change Ladder

- Existing primitives reused: saved text `writing_mode`, existing auto-layout/grid baseline grouping, existing HTTP agent commands, existing Inspector coordinate readouts, and the existing Playwright CLI service runner.
- New code required: one shared solver rule in the web and server layout engines replacing the old width/2 vertical-text baseline heuristic for horizontal row baseline groups.
- Validation preserved: focused web/server geometry tests, Playwright CLI browser proof, Penpot benchmark update, and Full Verification as the PR merge gate.

## RED Evidence

Focused web and server layout tests were patched first and failed against the old implementation because the caption stayed at y=27, aligned to the old 20px vertical-text center heuristic, instead of y=103, aligned to the vertical text block-end border edge at 96px.

## Verification Plan

- Web state tests cover horizontal auto-layout and grid row baseline geometry with a vertical writing-mode title and horizontal caption.
- Server layout tests cover the same geometry through the storage-side relayout engine.
- Playwright e2e uses HTTP agent commands to create the document state, then verifies the visible browser Inspector reports caption x=70 and y=103 after selecting the layer.
- Full Verification remains the merge gate.

## Status

Implemented through the Penpot maturity loop after deployment was explicitly deferred.
