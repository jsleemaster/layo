# Failure Learning Loop

Use this process whenever the user points out a missed detail, visual regression,
incorrect assumption, weak verification, or repeated failure in Canvas MCP Editor
work.

## Purpose

The goal is to turn misses into durable project behavior. A fix is incomplete if
it only changes the immediate code path and leaves the same agent failure pattern
free to recur.

## Required Loop

1. Treat the correction as a process failure, not only as a local bug.
2. State the concrete root cause before changing implementation.
3. Write or update a focused failing test that reproduces the missed behavior
   when the miss is testable.
4. Implement the smallest change that makes the focused test pass.
5. For UI behavior, run a direct Playwright CLI interaction pass against the
   live editor and record the visible state that changed.
6. Add or update a memory note when the miss reflects an agent process gap,
   especially missed empty, hover, focus, active, selected, disabled, drag, or
   browser-visible states.
7. Update project docs or rules when the miss changes future agent workflow.
8. Put the failure mode, regression test, live verification, and docs or memory
   update in the PR body.

## UI Detail Checklist

For editor UI changes, check these states when they are relevant to the changed
control or canvas object:

- default
- empty
- hover
- focus
- active
- selected
- disabled
- dragging or resizing
- keyboard shortcut path
- undo and redo path

Do not treat value-level assertions as visual proof. A test that proves a value
changed is useful, but it does not prove the screen looks right.

## Durable Evidence

Use all applicable evidence types:

- Focused e2e or unit coverage for the missed state.
- Full relevant verification commands.
- Direct Playwright CLI interaction notes for browser-visible behavior.
- Memory note under `/Users/leeo/.codex/memories/extensions/ad_hoc/notes/`
  when the miss should affect future agent behavior.
- PR body notes that name the original miss and the exact verification.

## PR Body Minimum

The PR body must include:

- The user-visible failure or missed detail.
- The root cause.
- The regression coverage added or updated.
- The direct Playwright CLI check for UI issues.
- Whether a memory note was added or why it was not needed.
