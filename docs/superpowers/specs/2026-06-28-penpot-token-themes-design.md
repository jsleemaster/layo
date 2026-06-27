# Penpot Token Themes Design

## Reference

- Penpot Design Tokens: https://help.penpot.app/user-guide/design-systems/design-tokens/
- Reference capability: Token Themes configure token sets for brand, mode, touchpoint, and similar contexts. Multiple theme groups can be active together, but only one theme inside the same group can be active.

## Decision

Layo will adopt the Penpot theme concept and adapt it to the existing local-first token-set model. The first slice stores document-local token themes, lets agents and the web editor activate a theme, resolves active tokens from the token sets included by active themes, and exports/imports theme metadata through the existing DTCG token document path.

## Data Model

Add `DesignTokenTheme`:

- `id`: stable theme id.
- `name`: visible theme name.
- `group`: optional group such as `mode`, `brand`, or `platform`.
- `enabled`: whether this theme is active.
- `token_set_ids`: ordered token set ids included by the theme.

Add optional `token_themes` to `DesignFile`/`RendererDocument`.

Theme activation rules:

- Activating a theme sets its `enabled` to `true`.
- If the activated theme has a non-empty `group`, all other themes in that group become disabled.
- Deactivating a theme sets only that theme to `false`.
- Token sets that are directly enabled still participate in resolution.
- Active themes add their `token_set_ids` to the active set list, preserving document token-set order for cascade precedence.

## Product Surface

- Agent command: `set_token_theme_enabled`.
- MCP schema: accept `set_token_theme_enabled` in `apply_agent_commands`.
- Inspection: `inspectCanvas()` returns `tokenThemes`.
- Web state: undo/redo-safe `set_token_theme_enabled`, with bound fills/typography/layout spacing rematerialized after theme changes.
- Web UI: the right Inspector token area lists theme groups and theme toggles in Korean-first labels.
- DTCG: export `$themes` plus `$metadata.activeThemes`; import `$themes` and active themes back into `token_themes`.

## Scope Boundaries

This slice does not build a full theme edit modal, drag reorder UI, hosted shared-library theme sync, or visual theme matrix. It closes the baseline document semantics and visible activation workflow so later slices can add richer management.

## Verification

- RED/GREEN tests for DTCG import/export theme metadata and active theme token resolution.
- RED/GREEN server tests for agent command, validation, and inspection.
- RED/GREEN web reducer tests for undo/redo and materialization.
- Playwright CLI coverage for activating token themes from the Inspector and seeing a bound node update.
- Benchmark and plan status updated with remaining theme-management gaps.
