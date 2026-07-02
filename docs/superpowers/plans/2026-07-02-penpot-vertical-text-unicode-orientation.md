# Penpot Vertical Text Unicode Orientation Plan

## Goal

Close the next Penpot-maturity text-layout gap after the vertical writing-mode and orientation-control work: make Layo's `mixed` vertical canvas text orientation handle more than ASCII-only Latin text while preserving local-first deterministic rendering.

## Penpot Benchmark Check

Penpot positions itself as an open-source design platform for teams with design/code/AI workflows, self-hosting, design tokens, plugin/API extension, and code/CSS-centered handoff. For this slice Layo should not clone a Penpot control surface. It should adapt the professional expectation behind CSS vertical text semantics into the Konva canvas renderer so exported CSS and visible canvas behavior stay closer together.

## Current Gap

`VerticalCanvasText` currently treats only ASCII printable glyphs as sideways in `text_orientation: mixed`. That leaves common horizontal-script glyphs such as Latin accents, Greek, Cyrillic, Arabic/Hebrew, and symbols/digits under-tested, while CJK/fullwidth punctuation needs to remain upright.

## Scope

- Extract vertical text glyph orientation into a focused web module.
- Add unit coverage for mixed/upright/sideways behavior across representative scripts and punctuation.
- Wire the canvas renderer to the shared helper.
- Add a focused e2e regression that sets mixed vertical text with non-ASCII horizontal and CJK glyphs, then verifies the editor/control/dev-handoff path still works.
- Update the Penpot maturity benchmark and plan status after verification.

## Deliberate Non-Scope

- Full Unicode UAX #50 conformance tables.
- Font-specific OpenType vertical substitutions.
- A new inspector UI control beyond the already merged writing-mode and text-orientation controls.
- Deployment work; deployment is explicitly lower priority for this loop.

## Verification

- `pnpm --filter @layo/web test -- vertical-text-orientation`
- `pnpm typecheck`
- `pnpm test`
- Focused Playwright e2e against `apps/web/e2e/editor-mvp.spec.ts` for vertical text orientation.
- Direct Playwright CLI interaction pass on the live editor if local runtime becomes available; otherwise record the GitHub Actions/browser verification limitation in the PR.
