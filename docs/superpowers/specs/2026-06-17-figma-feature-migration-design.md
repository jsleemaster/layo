# Figma Feature Migration Design

## Goal

Build a Figma-informed roadmap for Layo and start implementation with the missing layout behavior that users expect from a Figma-like editor.

## Product Boundary

Layo should not copy every Figma product. It should copy the interaction primitives that make design editing predictable, then adapt the handoff and automation surface around MCP/HTTP.

Adopt now:

- Constraints.
- Auto layout.
- Precision canvas editing.
- Component variants/properties.
- Variables/styles.
- Comments/history/prototyping after the core editor stabilizes.

Adapt:

- Dev Mode as a visible panel backed by existing agent inspection and code export.
- Code Connect as local component mapping.
- Figma MCP ideas as deterministic Layo tools.
- Libraries as local/team-owned design assets.

Defer or exclude:

- Full FigJam, Slides, Buzz, Make clone, hosted Sites publishing, and enterprise admin.

## Architecture Direction

The Figma parity surface must be implemented in this order:

1. Document model fields.
2. Rust serialization and command compatibility.
3. TypeScript renderer and editor state.
4. Server storage and agent commands.
5. Browser UI controls.
6. Code export and inspect metadata.
7. Playwright CLI verification.

No Figma-like behavior should exist only as React UI state. If an agent cannot inspect and mutate it deterministically, the feature is incomplete.

## Lane 1 Layout Scope

Add a small, explicit layout model:

```ts
type LayoutMode = "none" | "auto";
type LayoutDirection = "horizontal" | "vertical";

interface NodeLayout {
  mode: LayoutMode;
  direction: LayoutDirection;
  gap: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

interface NodeConstraints {
  horizontal: "left" | "right" | "left_right" | "center" | "scale";
  vertical: "top" | "bottom" | "top_bottom" | "center" | "scale";
}
```

Initial solver rules:

- A node with `layout.mode = "auto"` repositions direct children in document order.
- Vertical layout stacks children from top padding to bottom with `gap`.
- Horizontal layout stacks children from left padding to right with `gap`.
- Parent size remains fixed in the first slice.
- Constraints apply to direct children when a parent frame resizes and the parent is not auto-layouting that child.
- Default constraints are left/top.

Later solver rules:

- Hug/fill/fixed resizing.
- Grid auto layout.
- Wrap.
- Min/max.
- Ignore auto layout.
- Intrinsic text measurement.

## Verification Contract

The first implementation slice is not complete until:

- Unit tests prove auto layout changes child positions after create, resize, and layout-setting changes.
- Unit tests prove constraints respond to parent resize.
- Server agent commands can set layout and constraints.
- Code export includes layout and constraints metadata.
- Playwright CLI proves auto-layout behavior in the rendered editor.
- Existing component drag and collaboration tests still pass.
