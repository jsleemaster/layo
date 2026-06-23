# Post-Merge Cleanup

This process must run after every successful PR merge in Layo.
Treat cleanup as part of the merge, not as optional follow-up work.

## Purpose

The repository often uses multiple worktrees for parallel feature work. A merge
is incomplete if the feature branch is merged but the local environment still
points at stale branches, orphaned worktrees, deleted remote refs, or ambiguous
dirty states that can mislead the next task.

## Required Loop

1. Verify the PR is merged with `gh pr view <number> --json state,mergedAt,mergeCommit,url`.
2. Synchronize the working branch with the merged base branch. Confirm the active
   branch with `git branch --show-current` and status with
   `git status --short --branch`.
3. Confirm remote refs with `git ls-remote --heads origin main <feature-branch>`.
   The merged feature branch should be gone when the merge deleted it.
4. Inspect all worktrees with `git worktree list`.
5. Remove only safe stale worktrees:
   - the worktree is clean,
   - the branch is already merged or the remote feature branch was deleted,
   - no user-owned uncommitted files are present.
6. Prune stale worktree metadata after removal with `git worktree prune`.
7. Leave dirty, unmerged, or ambiguous worktrees in place and report them as
   cleanup exceptions.
8. Final response must include cleanup status: current branch, PR merge state,
   removed worktrees or branches, retained exceptions, and the commands used to
   prove the environment is ready for the next task.

## Safe Commands

Use non-destructive checks first:

```bash
gh pr view <number> --json state,mergedAt,mergeCommit,url
git status --short --branch
git branch --show-current
git worktree list
git ls-remote --heads origin main <feature-branch>
```

Use removal only after a clean-state check:

```bash
git -C <worktree-path> status --short --branch
git worktree remove <worktree-path>
git worktree prune
```

## Cleanup Exceptions

Do not remove a worktree or branch when any of these are true:

- `git status --short` is not empty.
- The branch is not clearly merged.
- The worktree is the active workspace for the current task.
- The worktree contains user-owned or unknown changes.
- The remote branch still exists and the PR state was not confirmed as merged.

When an exception exists, keep working from a known-clean current branch and
state the exception explicitly.
