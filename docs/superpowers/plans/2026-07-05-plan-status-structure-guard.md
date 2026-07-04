# 2026-07-05 PLAN_STATUS Structure Guard

## Goal

Recover `docs/superpowers/PLAN_STATUS.md` as the canonical routing source of
truth and add a regression gate so future document-cleanup commits cannot
prepend duplicate table fragments ahead of the title.

Deployment remains intentionally deferred for this loop.

## Failure Mode

PR #221 used a remote API text transformation to insert completed-plan rows into
`PLAN_STATUS.md`. The transformation left a duplicate `## Completed Plans` table
fragment before `# Superpowers Plan Status` and concatenated the second inserted
row with the title on the same line. Full Verification did not catch the damage
because `check:penpot-maturity` checked the existence of Penpot docs but not the
routing document structure.

## Root Cause

The document update was treated as content evidence instead of a structured
routing contract. The regression gate asserted product maturity terms but did
not require the plan-status document to start with exactly one top-level title,
contain one current-active-plan table, and contain one completed-plans table in
that order.

## Minimal Change Ladder

- Reuse: keep the existing `check:penpot-maturity` Node test entry point because
  Full Verification already runs it before typecheck/build/e2e.
- New code: add only a focused Markdown structure assertion for `PLAN_STATUS.md`.
- Repair: remove the duplicated preamble and place the two completed Penpot ZIP
  import rows in the canonical completed table.

## RED Case

`pnpm run check:penpot-maturity` should fail on current main because
`PLAN_STATUS.md` does not start with `# Superpowers Plan Status`, has two
`## Completed Plans` headings, and contains a table row immediately followed by
`# Superpowers Plan Status`.

## Test Plan

- `pnpm run check:penpot-maturity`
- Full Verification GitHub Actions
- Storage Restore Drill GitHub Actions
- Storage Backup Retention GitHub Actions

## Evidence

- RED: pending after PR creation.
- GREEN: pending after document repair.

## Remaining Follow-up

After this guard lands, resume the Penpot import/export maturity loop with the
next functional gap, likely Penpot `fill-image` paint import.
