# Penpot Cross-Process Storage Lock Delta

Last checked: 2026-07-14

## Failed Case

Two server processes could mutate the same library-update target concurrently.
The existing in-process queue serialized storage instances in one Node process,
but it did not protect a shared local storage root from another process. A
process killed while holding the new lock also left a lock directory that could
block later saves indefinitely.

RED Full Verification `29271071500` ran 275 server tests and failed because
the normal product writer completed before the paused library update released
its target. RED `29271703839` ran 276 server tests and failed because the
writer timed out behind the killed owner's abandoned lock.

The first implementation used one root-global lock. Full Verification
`29271272495` exposed a self-deadlock when an update callback published a
different library document while the outer update still held that global lock.
The failed case changed the design to resource-scoped locks and one fixed
`subscriptions -> target` order.

## Penpot Decision

- **Adopt:** Penpot's server-side transaction and row-lock principle for
  coordinating writes that share ownership.
- **Adapt:** Layo uses a SHA-256 resource-keyed lock directory because its
  local-first storage contract is a filesystem, not a required database.
  Library updates acquire the subscription resource before the target resource;
  ordinary saves acquire only their target resource.
- **Adapt:** each owner records a random token, PID, hostname, and acquisition
  time. Acquisition publishes a fully written candidate directory by atomic
  rename, and release verifies the token before removing ownership.
- **Adapt:** a contender may recover only a same-host owner whose PID is dead
  and whose age exceeds the configured stale threshold. A hard-link claim and
  token recheck prevent an old contender from deleting a newer owner.
- **Diverge:** Layo does not automatically steal a cross-host stale lock.
  Without a shared lease authority, timing alone cannot prove that a remote
  owner is dead; bounded timeout and operator recovery are safer than data loss.

Penpot reference commit:
`a006a12ab6929804af918ec1f5c845d0aeab8b51`.

- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/rpc/commands/files.clj
- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/db.clj

## Product Evidence

- `apps/server/src/storage.ts` owns resource-scoped acquisition, release,
  bounded timeout, and stale-owner recovery.
- `apps/server/src/storage-process-lock-worker.ts` drives independent Node
  processes through update, hold, and write modes.
- `apps/server/src/external-migration.penpot-components.test.ts` proves a
  paused library update blocks a second process and a killed same-host owner is
  recovered before the bounded wait expires.
- Full Verification `29272224030` passed maturity/design gates, typecheck,
  web build, 251 web tests, 276 server tests, Rust workspace tests, and the
  192-case Playwright suite. The browser suite reported one retried grid-drag
  flake; the exact drag now emits intermediate pointer movement and remains a
  required clean PR-head check rather than being hidden by the retry.
- Deployment remains non-gating while Vercel build-rate limits are deferred.

## Post-Merge Review Failure Loop

PR #291's automated review found that the first lock covered only the final
`writeFile`, while public mutations such as `updateNodeGeometry` still read
the document before acquiring that lock. Two processes could therefore read the
same old JSON, serialize only their final writes, and silently lose one edit.

RED Full Verification `29274040649` proved the loss: concurrent x/y geometry
updates finished as `{ x: 111, y: 96 }` instead of preserving `y: 222`.
The repair moved normal document mutations to one `mutateFile` transaction
that acquires the resource lock before the latest read and holds it through
mutation, write, and automatic version accounting. Library imports, token
replacement, version restore, and persisted agent-command writes use the same
operation-level boundary.

Failure-learning run `29274598077` exposed nested target-lock writes left by
the remote mechanical refactor, causing 15 library tests to time out. Removing
those two inner writes produced GREEN Full Verification `29274757103`: 251
web tests, 277 server tests, Rust workspace tests, and 192 Playwright cases
passed cleanly.

## Publication Follow-Up

The exact remaining gap was reproduced and closed by
`docs/product/penpot-library-publication-transaction-delta.md`. Competing
publishers now serialize the complete archive/metadata/event publication, and a
publisher killed after archive replacement is rolled back from a durable
journal before registry state is served.

## Remaining Gap

Filesystem publication is recoverable on one host. Hosted multi-instance
registry ownership, authorization, transactional object storage, backup
retention, and durable pub/sub remain open.
