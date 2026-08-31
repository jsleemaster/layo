---
version: alpha
name: Layo Design System
description: "A local-first design editor interface for technical creative work. The UI should feel quiet, precise, and inspectable: neutral panels, bright document stage, exact spacing, visible hierarchy, and restrained accent colors for focus, selection, and MCP/AI affordances. Inspired by DESIGN.md conventions from VoltAgent/awesome-design-md, but authored as a product-specific system rather than a brand clone."
---

# Layo DESIGN.md

This file defines how Layo should look and feel. Agents should treat it as the project-level design source of truth, alongside the executable tokens in `apps/web/src/design-tokens.css` and `apps/web/src/design-tokens.ts`.

## 1. Visual Theme & Atmosphere

Layo is an operational design tool, not a marketing surface. It should feel calm, technical, and built for repeated use.

- Primary feeling: precise, local-first, durable, inspectable.
- Density: compact but not cramped.
- Surfaces: pale app canvas, white stage, soft panel chrome.
- Color usage: neutral UI first; reserve accent colors for selection, focus, state, and AI/MCP affordances.
- Avoid decorative gradients, oversized hero type, floating marketing cards, and ornamental background effects.

## 2. Color Palette & Roles

Use semantic tokens, not raw color values, in product UI styles.

| Token | Value | Role |
| --- | --- | --- |
| `--editor-color-app` | `#eef2f6` | Outer app background |
| `--editor-color-panel` | `#fbfcfe` | Sidebar and control panels |
| `--editor-color-stage` | `#ffffff` | Design canvas/stage |
| `--editor-color-stage-shadow` | `rgb(28 34 48 / 12%)` | Stage elevation |
| `--editor-color-ink` | `#172033` | Primary text |
| `--editor-color-muted` | `#5f6f86` | Secondary text |
| `--editor-color-border` | `#d6dde8` | Panel separators |
| `--editor-color-border-soft` | `#dbe3ef` | Control borders |
| `--editor-color-control` | `#ffffff` | Buttons and small controls |
| `--editor-color-focus` | `#2f6fec` | Keyboard focus and active outlines |
| `--editor-color-selection` | `#6d5efc` | Canvas selection and resize handles |
| `--editor-color-mcp` | `#0f9f8f` | MCP/AI status and affordances |
| `--editor-color-warning` | `#f5b02e` | Non-blocking warnings |

## 3. Typography Rules

Use system UI fonts for the app shell. User-created document text can come from the document model and should not be force-normalized by app UI tokens.

| Token | Value | Role |
| --- | --- | --- |
| `--editor-font-sans` | Inter/system sans stack | App chrome |
| `--editor-text-title` | `18px` / `1.2` / `700` | Product title and panel headers |
| `--editor-text-body` | `14px` / `1.5` / `400` | Default UI copy |
| `--editor-text-small` | `13px` / `1.5` / `400` | Secondary panel copy |
| `--editor-text-control` | `14px` / `1.2` / `500` | Buttons and layer rows |

Rules:

- Letter spacing is `0` unless a compact all-caps label explicitly needs tracking.
- Do not use viewport-scaled font sizes.
- Keep panel headings compact; no hero-scale type inside editor chrome.

## 4. Component Stylings

### App Shell

- Left sidebar width: `--editor-size-sidebar`.
- Canvas area scrolls independently.
- Stage uses `--editor-color-stage` with `--editor-shadow-stage`.

### Layer Rows

- Use white controls with `--editor-color-border-soft`.
- Radius: `--editor-radius-sm`.
- Padding: `--editor-space-xs` vertical, `--editor-space-sm` horizontal.
- Active/focus states use `--editor-color-focus`.

### Canvas Stage

- The stage frame should be a fixed-format surface with stable dimensions.
- Do not let hover states, labels, or loading text resize the stage.
- Canvas objects may use document-provided colors, but app overlays must use design tokens.

## 5. Layout Principles

Spacing scale:

| Token | Value |
| --- | --- |
| `--editor-space-xxs` | `4px` |
| `--editor-space-xs` | `8px` |
| `--editor-space-sm` | `12px` |
| `--editor-space-md` | `16px` |
| `--editor-space-lg` | `24px` |
| `--editor-space-xl` | `32px` |

Rules:

- Use the spacing scale for padding, margins, and gaps.
- Page sections are not floating cards; only repeated controls and future modals are card-like.
- Keep tool surfaces dense and scannable.

## 6. Depth & Elevation

Use one quiet shadow for the stage. Panels and controls rely on borders instead of shadows.

| Token | Value | Role |
| --- | --- | --- |
| `--editor-shadow-stage` | `0 10px 30px var(--editor-color-stage-shadow)` | Stage depth |

## 7. Do's and Don'ts

Do:

- Use semantic CSS variables in app UI.
- Keep layout dimensions stable through tokens.
- Keep controls compact and predictable.
- Use accent colors sparingly and consistently.
- Keep AI/MCP affordances visually distinct from core editing selection.

Don't:

- Hard-code hex, RGB, radius, spacing, or font-size values outside token files.
- Add decorative gradient blobs, bokeh, or ornamental backgrounds.
- Use a one-note palette.
- Nest UI cards inside other cards.
- Use visible instructional text to explain controls that should be self-evident.

## 8. Responsive Behavior

Initial MVP targets desktop-first editor use.

- Minimum comfortable viewport: `1024px` wide.
- Sidebar remains fixed-width until a future responsive shell is designed.
- Canvas area scrolls rather than collapsing core editor chrome.
- Touch targets should be at least `32px` in compact tool areas.

## 8.1 Editor Entry, Help, And Page Context

- The default Assets surface may remain the first view, but an empty local store must expose one working primary action that creates a project and opens an editable layer context.
- Visible catalog or template examples must not use button semantics until they perform an actual product action. Preview-only items use static row/card semantics and say that they are examples.
- Every rail action must open a visible surface. Help opens a Korean quick-start and only lists shortcuts the editor currently implements.
- `?` opens and closes Help when focus is not inside a text-entry control.
- Global canvas shortcuts must not intercept native activation or navigation while an interactive control has focus. Text-entry controls keep every editing key; layer rows behave as the editor selection surface and continue to forward Space pan, Enter edit, Arrow, Delete, and command-modified actions after selection.
- Multi-page documents expose their existing pages in the Layers surface. One active page owns the visible layer list, canvas paint, comment overlays, Inspector page context, and page-level developer export review.
- Collaboration cursors, selection bounds, and editing claims are scoped to that same active page. Incoming document changes immediately reconcile stale selection presence, and saved-version preview keeps live-editor overlays hidden until preview exit. Legacy presence without a page id is visible only on the first page, matching the pre-navigation client behavior.
- Saved-version preview owns a separate preview page id. Falling back to a page that exists only in an older snapshot must never replace the live active page or clear the live selection; every non-Restore exit returns to that live page and selection.
- Clipboard paste targets and drag-snap candidates must also belong to the active page. A nested copy snapshots its parent origin at copy time, then preserves that document-space position while reparenting to the active page root.
- Page-scoped image insert and replacement work revalidates the active page after every pre-commit async boundary. If the page changed before persistence starts, the upload is cancelled and its unreferenced asset is removed.
- Once an image document write starts, server and local reconciliation complete in the same per-file queue step. A later page switch preserves the newer active-page selection while the committed source-page document change is retained.
- Confirmed image reconciliation uses the document visible at queue start as its merge base, so mid-flight locks and later queued replacements converge without rejecting the server commit or letting an older result win.
- In a collaboration session, an applied confirmed image insertion or replacement is a user-authored UndoManager transaction. Server-only convergence remains non-undoable; successful image edits must support Undo/Redo and persist both directions.
- Concurrent image drops reserve distinct node IDs before their first async boundary. Previous replacement assets are not deleted immediately because editor undo history may still reference them; cleanup requires a separate history-aware GC policy.
- If a confirmed image delta is completely superseded by a newer local delete, cleanup of that newly uploaded asset is queued after pending file writes; the server reference check remains authoritative.
- Changing active page clears stale selection. Active page is editor-session state; switching pages does not mutate the document.
- Page creation, rename, delete, and reorder remain a separate document-mutation capability and must not be implied by the page switcher.

## 9. Agent Prompt Guide

When modifying UI:

1. Read `DESIGN.md`.
2. Use `apps/web/src/design-tokens.css` for CSS values.
3. Use `apps/web/src/design-tokens.ts` for runtime canvas/UI constants.
4. Run `pnpm run check:design-rules`.
5. Do not bypass the checker by adding allowlists unless the design rule itself changes.
6. If a requested UI change conflicts with this file, stop before editing UI, cite the specific rule that would be violated, and ask the user to confirm whether they still want the exception.
7. Only after explicit user confirmation, update the design rule first, then implement the UI change against the updated rule.

Quick prompt:

> Build Layo UI as a quiet, precise, local-first design tool. Use semantic design tokens only, keep panels compact, keep the stage bright and stable, and reserve accent colors for focus, selection, state, and MCP/AI affordances.
