---
version: alpha
name: Canvas MCP Editor Design System
description: "A local-first design editor interface for technical creative work. The UI should feel quiet, precise, and inspectable: neutral panels, bright document stage, exact spacing, visible hierarchy, and restrained accent colors for focus, selection, and MCP/AI affordances. Inspired by DESIGN.md conventions from VoltAgent/awesome-design-md, but authored as a product-specific system rather than a brand clone."
---

# Canvas MCP Editor DESIGN.md

This file defines how Canvas MCP Editor should look and feel. Agents should treat it as the project-level design source of truth, alongside the executable tokens in `apps/web/src/design-tokens.css` and `apps/web/src/design-tokens.ts`.

## 1. Visual Theme & Atmosphere

Canvas MCP Editor is an operational design tool, not a marketing surface. It should feel calm, technical, and built for repeated use.

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

> Build Canvas MCP Editor UI as a quiet, precise, local-first design tool. Use semantic design tokens only, keep panels compact, keep the stage bright and stable, and reserve accent colors for focus, selection, state, and MCP/AI affordances.
