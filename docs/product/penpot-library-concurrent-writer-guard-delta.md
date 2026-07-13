# Penpot Library Concurrent Writer Guard Delta

**PR:** #288  
**Status:** Concurrent target edits are preserved and same-target library updates
are serialized. Concurrent subscription writers and crash-level recovery remain active.

## Failed Cases

The rollback path captured the target before writing but restored that snapshot
unconditionally after a later failure. A product edit written between the library
update and rollback was therefore overwritten.

RED Full Verification `29260679953` injected that exact writer after the
subscription write. The update rejected with the injected error instead of a
rollback conflict and restored over the newer target bytes.

A second gap remained after the identity guard: two
`updateLibraryRegistryItem` calls for the same target could both enter archive
read and mutation concurrently. RED Full Verification `29261211518` passed
typecheck and build, then failed only the new server regression: expected the
second update to remain `blocked`, but observed `entered`. The server result
was 267 passed and 1 failed out of 268.

## Benchmark Decision

Penpot commit `a006a12ab6929804af918ec1f5c845d0aeab8b51` executes library
mutation RPCs in a database transaction. Its file update path reads the target
with `:lock-for-update? true`, writes the file, and increments `:revn`.

- **Adopt:** serialize mutations to one target and reject restoration when the
  current target no longer matches the bytes written by the failing operation.
- **Adapt:** use an in-process storage-path queue and exact filesystem byte
  identity because Layo is local-first and has no required hosted database.
- **Diverge:** keep arbitrary product writes outside the library-update queue;
  optimistic rollback identity preserves those writes instead of blocking every
  document mutation behind a database row lock.

References:

- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/rpc/commands/files.clj
- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/db.clj

## Implemented Contract

- Queue library updates by canonical target storage path at module scope, so
  separate `FileStorage` instances sharing one root also serialize.
- Release the queue in `finally` and remove only the current tail, allowing a
  failed update to unblock its successor without deleting a newer queue entry.
- Record the exact serialized target bytes after the library write.
- Before any compensating restore, compare every guarded path with those expected
  bytes. If a concurrent product writer changed the target, restore nothing and
  throw an `AggregateError` identifying the rollback conflict.
- Preserve the concurrent product edit and the applied compatible library bytes;
  an explicit retry succeeds without discarding the product edit.
- Keep the exact asset, target, and subscription restoration behavior from PR
  #287 when no concurrent writer is present.

## Verification

GREEN Full Verification `29261431646` passed:

- Penpot maturity and design rule gates
- TypeScript typecheck and web build
- 251 web tests
- 268 server tests
- Rust workspace tests
- 192 Playwright CLI tests

## Failure Learning

**Root cause:** compensating rollback assumed that the state written by the
failing operation still owned the target path. The update path also had no
same-target critical section, unlike Penpot's transaction plus row lock.

**Durable guards:** one regression writes a newer product edit after the update
and proves rollback reports a conflict without restoring any stale snapshot.
Another holds the first archive read, starts a second update, and proves the
second cannot enter until the first releases the target queue.

## Remaining Risk And Next Goal

The subscription store is shared across targets and is not yet protected by an
expected post-write identity. A concurrent subscription writer can still be
overwritten by compensating restore. A process crash or power loss still skips
the catch block entirely.

Inject a concurrent subscription metadata write after the update's subscription
commit and require rollback to preserve it. Then add a recoverable filesystem
journal or atomic commit protocol and prove restart recovery after termination
at each write boundary.
