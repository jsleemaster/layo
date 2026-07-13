# Penpot Library Crash Recovery Journal Delta

**PR:** #290  
**Status:** Interrupted library asset, target, and subscription writes now recover
from a durable write-ahead journal on storage startup. Recovery runs once per
storage instance so live same-process transactions are not mistaken for restart
residue. Cross-process mutation locking remains active.

## Failed Case

Caught failures were recoverable, but process termination skipped the catch block.
A new storage instance therefore observed partially updated target and asset bytes
with the old subscription metadata.

RED Full Verification `29266760052` paused the update at the subscription
boundary after target and asset writes, then constructed a new `FileStorage`
instance and called `prepareFiles()`. Maturity gates, typecheck, and build passed;
270 of 271 server tests passed. Restart retained the new `#e11d48` target instead
of restoring the exact original snapshot.

## Benchmark Decision

Penpot commit `a006a12ab6929804af918ec1f5c845d0aeab8b51` executes library
mutations in a database transaction and protects mutation targets with row locks.

- **Adopt:** a process must expose either the prior library revision or the
  committed revision, never an untracked mix after restart.
- **Adapt:** persist original and intended filesystem bytes in a local write-ahead
  journal and restore the original revision during startup.
- **Diverge:** use fsync plus same-directory atomic rename and local startup
  recovery instead of requiring a hosted transactional database.

References:

- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/rpc/commands/files.clj
- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/db.clj

## Implemented Contract

- Capture exact original bytes for every affected asset data file, asset metadata
  file, target document, and shared subscription store.
- Persist intended asset and target bytes before the first mutation.
- Persist intended subscription bytes before its write, while keeping the
  committed callback after the write.
- Write journals through a synced temporary file, atomic rename, and directory
  fsync.
- Write journaled asset, target, and subscription paths through the same durable
  temporary-file and atomic-rename primitive, preventing truncated final paths.
- On the first `prepareFiles()` or `prepareProjects()` call for a
  `FileStorage` instance, scan recovery journals before exposing stored
  documents. Concurrent and later prepare calls share the same settled startup
  promise instead of re-entering recovery over a live transaction.
- Recover only when every current path equals either its original or intended
  bytes. Restore all originals, remove the journal, and fsync the recovery
  directory.
- If any path is outside journal intent, preserve it, retain the journal, and
  report a rollback conflict instead of overwriting an external writer.
- Remove the journal after successful commit, successful caught rollback, or a
  caught optimistic conflict that has already preserved external state.

## Verification

GREEN Full Verification `29269613815` passed after the active-journal
failure-learning fix:

- Penpot maturity and design rule gates
- TypeScript typecheck and web build
- 251 web tests
- 274 server tests
- Rust workspace tests
- 192 Playwright CLI tests

The restart regressions cover:

- interruption after asset and target writes but before subscription commit
- interruption after changed asset, target, and subscription writes but before
  journal cleanup
- exact restoration of document, subscription, asset metadata, and asset data
- refusal to recover over a target outside original and intended journal bytes

## Failure Learning

**Initial root cause:** compensating rollback existed only in the live call
stack. No durable mutation intent survived process termination, and direct
final-path writes could leave truncated files that were neither old nor new.

**Follow-up failed case:** Full Verification `29268578370` exposed a missing
newly published component in the browser library-update flow. Focused RED
`29269470254` then paused a live update at the subscription boundary and called
`listProjects()` on the same storage instance. The project prepare path
re-entered startup recovery and restored the original `#f97316` component over
the live intended `#0f766e` bytes.

**Follow-up root cause:** startup recovery was data-idempotent but not scoped to
the storage-instance lifecycle. Every project prepare call rescanned journals,
so ordinary same-process reads could interpret an active WAL as restart residue.

**Durable guard:** restart tests keep the original update unresolved to model a
lost process, instantiate new storage against the same root, and verify startup
recovery or conflict without invoking the original catch path. The focused
same-process regression now proves project reads cannot recover an active
journal after startup preparation has already settled.

## Remaining Risk And Next Goal

The in-memory mutation queue does not coordinate separate server processes that
share one storage root. Two `FileStorage` processes can still enter the same
target or shared subscription mutation concurrently, and recovery preflight has
no cross-process exclusion window.

Add a filesystem mutation lock with ownership metadata, atomic acquisition,
bounded stale-lock recovery, and deterministic release. Prove two child processes
cannot overlap one target/subscription transaction and that restart safely
recovers an abandoned lock without deleting a live owner's lock.
