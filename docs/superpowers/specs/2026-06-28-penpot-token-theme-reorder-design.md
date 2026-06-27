# Penpot Token Theme Reorder Design

## Benchmark

Penpot design tokens use token sets as override layers. Its official design
tokens guide says token sets can be reordered by dragging, and if two token sets
contain the same token name, the later set overrides the earlier one. It also
uses token themes to activate sets together.

## Layo Gap

Layo already imports, exports, creates, edits, enables, and deletes
document-local token themes. The missing product behavior is order control:

- Designers cannot reorder token themes in the Inspector.
- Designers cannot reorder the selected token sets inside a theme, even though
  set order defines which value wins when a token name appears in multiple sets.
- Agents cannot perform those reorder operations through deterministic commands.

## Decision

Adopt the Penpot model, adapted to Layo's local-first document model:

- Add `reorder_token_theme` for moving a theme within the document-local
  `token_themes` array.
- Add `reorder_token_theme_set` for moving one selected token set inside a
  theme's `token_set_ids` list.
- Keep the existing checkbox membership model. The new controls only change
  order; they do not create implicit sets or rewrite raw DTCG JSON.
- Re-materialize bound token values after each reorder because override order
  can change the resolved active token.

## Verification

- Server HTTP tests prove commands persist reordered themes and set order, and
  that bound token values rematerialize.
- Web state tests prove undo/redo preserves theme order and set override order.
- Playwright CLI e2e proves the right Inspector exposes reorder controls and
  persists the resulting order through the local API.
- Penpot maturity documentation records that theme reorder is no longer an open
  design-system gap, while visual theme matrix management and hosted
  theme/library registry sync remain open.
