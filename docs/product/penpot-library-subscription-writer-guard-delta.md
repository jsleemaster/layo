# Penpot Library Subscription Writer Guard Delta

**PR:** #289  
**Status:** A committed library subscription write now participates in optimistic
rollback identity. Concurrent external subscription metadata detected before
rollback is preserved. Cross-process crash recovery remains active.

## Failed Case

The target document had an exact post-write guard, but the shared
`subscriptions.json` store did not. After the library update committed its own
subscription, another writer could add metadata and a later failure would restore
the old whole-file snapshot over both writes.

RED Full Verification `29264877952` wrote a valid external subscription entry
after the update's subscription commit and then threw. Maturity gates, typecheck,
and build passed; 269 of 270 server tests passed. The update returned the injected
error instead of a rollback conflict, proving the external metadata was not part
of rollback identity.

## Benchmark Decision

Penpot commit `a006a12ab6929804af918ec1f5c845d0aeab8b51` keeps library file
mutations in a database transaction and protects the target with
`FOR UPDATE` semantics.

- **Adopt:** treat committed shared metadata as part of the same mutation identity.
- **Adapt:** register exact subscription bytes only after the filesystem write
  succeeds, then preflight them with the target guard before restoring anything.
- **Diverge:** use deterministic local filesystem snapshots rather than a required
  hosted database transaction.

References:

- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/rpc/commands/files.clj
- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/db.clj

## Implemented Contract

- Serialize the exact `subscriptions.json` payload once before writing.
- Invoke the internal committed callback only after the subscription file write
  resolves successfully.
- Add that exact path and bytes to the update's rollback guards.
- If an external writer changes target or subscription bytes, preflight fails
  before any asset, subscription, or target snapshot is restored.
- Preserve the external subscription entry and applied target bytes on conflict.
- Permit explicit retry to update the target subscription while retaining the
  unrelated external entry.
- Preserve PR #287 rollback behavior for failures before subscription commit.

## Verification

GREEN Full Verification `29265062411` passed:

- Penpot maturity and design rule gates
- TypeScript typecheck and web build
- 251 web tests
- 270 server tests
- Rust workspace tests
- 192 Playwright CLI tests

## Failure Learning

**Root cause:** rollback identity covered the target document but treated the
shared subscription store as update-owned even after another writer changed it.

**Durable guard:** the regression adds a valid second subscription through a raw
filesystem writer after commit, requires a rollback conflict, verifies target and
external metadata preservation, retries, and verifies the external entry remains.

## Remaining Risk And Next Goal

The queue and callbacks are process-local. Another process can still write after
identity preflight, and process termination can skip the catch block entirely.

Add a recoverable filesystem transaction journal or atomic commit protocol.
Terminate the process after each asset, target, and subscription write boundary;
restart storage; recover deterministically; and prove no partial revision or
external writer is lost.
