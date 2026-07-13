# Penpot Idempotent Library Publication Delta

Date: 2026-07-14
Penpot reference: https://github.com/penpot/penpot/releases/tag/2.14.1
Penpot source: https://github.com/penpot/penpot/tree/develop

## Decision

Penpot explicitly retries idempotent RPC requests after network failures. Layo
adopts that operation contract and adapts it to local-first storage with durable
publication receipts.

A caller supplies `Idempotency-Key` for `POST /libraries`. The key is scoped
by the published library path, and its receipt records the normalized request
fingerprint and committed registry entry.

## Product Contract

- The first request commits archive bytes, registry metadata, one registry
  event, and one receipt under the existing process-safe registry lock.
- The publication recovery journal snapshots all four paths. A crash cannot
  expose a receipt without its publication or a publication without its receipt.
- A retry with the same key and request returns the original entry without
  advancing `updatedAt` or event sequence.
- The receipt survives a new `FileStorage` instance.
- Reusing the key for another file, library, name, or team returns HTTP 409 and
  performs no write.
- Requests without a key preserve the existing publication behavior.

## Evidence

- RED `29279535916`: the retry returned a different entry and appended a
  second event.
- Failure-learning `29280022017`: product behavior returned 409, while the HTTP
  test read Fastify's generic `error` field instead of the detailed `message`.
- Storage and HTTP regressions cover durable replay, one event, and conflict.

## Remaining Gap

This closes retry duplication for one team-owned filesystem transaction. It
does not provide hosted identity, cross-host lock ownership, shared database or
object-store transactions, receipt retention, or durable pub/sub fanout.
