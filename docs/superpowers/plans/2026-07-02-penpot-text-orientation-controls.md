# Penpot Text Orientation Controls

Date: 2026-07-02

## Goal

Close the next Penpot layout maturity loop after vertical text canvas rendering: vertical text must expose glyph orientation controls that are persisted, agent-editable, visible on canvas, and exported for developer handoff.

## Penpot Comparison

- Reference: Penpot open-source product class and layout/editor maturity target, `https://github.com/penpot/penpot`.
- Reference: CSS vertical writing behavior used by design/dev handoff, especially `text-orientation` values `mixed`, `upright`, and `sideways`.
- Decision: adapt. Layo keeps deterministic document fields and agent commands, then maps them to conservative Konva canvas behavior and native CSS handoff.

## Failure Case

PR #203 made `vertical_rl` and `vertical_lr` visible on the canvas, but all glyphs were rendered as upright columns. The benchmark still listed glyph-orientation controls as the next layout gap because Layo had no document field, Inspector control, agent command, MCP create path, canvas branch, or code-export metadata for `text-orientation`.

## Implementation

- Add `TextOrientation = mixed | upright | sideways` to renderer/server/Rust text content contracts.
- Add `set_text_orientation` and `create_text.textOrientation` to the agent command path, plus MCP `create_text` input support.
- Add a Korean-first right Inspector select for text orientation.
- Render vertical text as mixed ASCII-sideways glyphs, forced upright glyphs, or forced sideways glyphs on the Konva canvas.
- Export non-default `text-orientation` in CSS and structured dev handoff.
- Add focused reducer, storage/agent, Rust round-trip, code-export, and Playwright CLI regression coverage.

## Verification

PR #204 verification:

- Full Verification workflow: Penpot maturity/design rule gates, typecheck, web build, core tests, and full Playwright CLI e2e.
- Storage Restore Drill workflow.
- Storage Backup Retention workflow.
- Direct PR review confirmed the final diff is limited to text-orientation contracts, agent/MCP paths, Inspector/canvas rendering, code export, focused tests, and maturity documentation.

## Remaining Risks

- Mixed-mode script detection is conservative and currently treats ASCII glyphs as sideways while leaving non-ASCII glyphs upright. Full Unicode script and punctuation orientation fidelity remains a deeper typography follow-up, separate from this control/persistence/export slice.
