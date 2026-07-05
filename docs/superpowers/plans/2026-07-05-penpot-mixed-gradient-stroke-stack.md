# Plan: Penpot Mixed Gradient Stroke Stack Import

## Goal

Close the Penpot import/export maturity gap for solid `strokes` stacks that mix
solid stroke paints and gradient stroke paints in one ordered stack.

## Penpot Benchmark Decision

- Reference capability: Penpot can export ordered stroke paint records, including
  solid colors and `stroke-color-gradient` records, in one stack.
- Decision: adapt. Layo still stores one `style.stroke`, so this slice verifies
  deterministic visible flattening: gradient records are reduced to their
  midpoint color, then composited with solid records in Penpot front-to-back
  order.
- Deliberate divergence: exact gradient angle/radius, per-paint bands, blend
  modes, masks, and future first-class paint-stack preservation remain separate
  maturity gaps.

## Minimal-Change Ladder

1. Behavior belongs to the import/export maturity lane and is listed in
   `docs/product/penpot-solid-stroke-stack-maturity-note.md` as open.
2. Reuse the existing stroke stack fixture, server persistence tests, and
   Playwright file-panel import flow.
3. Add focused evidence before changing importer code; if current behavior fails,
   use the exact failed assertion as the next implementation goal.
4. Keep deployment deferred.

## Coverage Probe

- `apps/server/src/external-migration.penpot-stroke-stack.test.ts` adds a
  `Mixed gradient stroke card` whose front solid red stroke at 50% opacity sits
  above a green-to-blue gradient stroke. Expected flattened stroke color is
  `#804040` and expected width is 6.
- `apps/web/e2e/external-migration-penpot-stroke-stack.spec.ts` verifies the
  same imported layer through the visible file-panel import flow and persisted
  HTTP document.

## Verification Log

Pending.
