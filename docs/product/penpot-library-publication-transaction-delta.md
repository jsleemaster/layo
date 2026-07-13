# Penpot Library Publication Transaction Delta

Last checked: 2026-07-14

## Failed Cases

Library publication wrote three independently visible files: archive bytes,
registry metadata, and registry events. Two processes publishing the same
library id could interleave those writes and leave metadata from one source
pointing at archive bytes from another.

RED Full Verification `29276435367` ran 278 server tests and reproduced that
split state: registry metadata named `publication-a`, while archive review
returned `publication-b`. An earlier harness run `29276283130` timed out
because cleanup attached an exit listener after the child had already exited;
the helper now resolves already-completed children before testing product
behavior.

A second RED, Full Verification `29277054987`, killed a publisher after it
replaced the archive but before metadata was written. Restart left metadata at
`publication-recovery-a` while archive review returned
`publication-recovery-b`.

## Penpot Decision

- **Adopt:** one server-side transaction boundary for a shared-library
  publication and serialized ownership of competing publishers.
- **Adapt:** Layo uses one resource-keyed filesystem process lock plus a durable
  write-ahead snapshot journal because local-first storage cannot require
  Penpot's database transaction layer.
- **Adapt:** archive, registry metadata, and event bytes are captured as one
  original/intended set. Normal completion removes the journal; synchronous
  failure or startup after process death restores the complete original set.
- **Diverge:** same-host dead owners can be recovered from PID and token
  evidence, while cross-host ownership is never stolen by elapsed time alone.

Penpot reference commit:
`a006a12ab6929804af918ec1f5c845d0aeab8b51`.

- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/rpc/commands/files.clj
- https://github.com/penpot/penpot/blob/a006a12ab6929804af918ec1f5c845d0aeab8b51/backend/src/app/db.clj

## Product Evidence

- `apps/server/src/storage.ts` holds registry read, archive replacement,
  metadata replacement, event replacement, and journal cleanup under one
  process-safe registry lock.
- Registry metadata and event JSON use durable atomic replacement.
- Startup recovery reacquires the publication lock, rereads the journal after
  ownership is acquired, validates every current path against original or
  intended bytes, and restores the original publication set.
- `apps/server/src/storage-publication-worker.ts` drives paused, competing, and
  crash-after-archive publishers in independent Node processes.
- `apps/server/src/external-migration.penpot-components.test.ts` proves a
  competing publisher waits, final metadata matches archive contents, and a
  killed publisher is rolled back before registry state is served.
- Failure-learning run `29277350188` proved publication recovery GREEN but
  caught an over-broad recovery lock that delayed three existing same-process
  update-recovery tests past five seconds. The lock was narrowed to publication
  journals; the existing update-journal path remains immediate.
- Follow-up run `29277515496` passed 278 of 279 server tests and caught a
  changed update-recovery conflict message. Recovery now preserves the existing
  update contract while naming publication conflicts separately.
- Final PR-head Full Verification is the merge gate. This storage-only change
  has no new browser interaction; the complete Playwright CLI suite remains the
  browser regression proof.
- Deployment remains non-gating while Vercel build-rate limits are deferred.

## Remaining Gap

The local filesystem transaction is single-host recoverable. Hosted
multi-instance registry synchronization still needs durable shared ownership,
authorization, object-store/database transactions, backup retention, and
pub/sub fanout before it is Penpot-comparable across hosts.
