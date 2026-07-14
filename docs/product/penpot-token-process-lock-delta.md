# Penpot Token Process Lock Delta

Date: 2026-07-14
PR: #307

## Penpot Comparison

Penpot's account token lifecycle is a team-product capability whose committed
changes cannot disappear under concurrent server traffic. Layo adopts that
durability expectation while adapting implementation to a local-first,
operator-owned authorization file.

## Product Change

- Every token create or revoke now acquires a lock keyed by the authorization
  file's resolved path before reading current state.
- The lock spans parse, mutation, temporary-file write, and atomic replacement.
- Independent processes therefore observe the previous committed mutation
  before applying their own.
- Lock owner metadata contains no credential material.
- Release verifies a random ownership token before removing the lock.
- A stale lock is recovered only when it belongs to the same host and its PID is
  no longer alive.
- A live or remote-host lock remains authoritative and contention times out.
- `LAYO_AUTHORIZATION_LOCK_TIMEOUT_MS` and
  `LAYO_AUTHORIZATION_LOCK_STALE_MS` allow self-hosted operators to tune
  bounded waits.

## Failure Learning

RED Full Verification `29315315463` released six independent Node processes
against one file. Only process tokens 0, 3, and 4 survived, proving fresh reads
plus atomic rename still lost committed sibling writes. The regression now
requires all six deterministic token IDs after every process exits.

External review then found that a recoverer crash could leave the deterministic
claim path behind and block every later recovery. RED Full Verification
`29316494422` pre-created that orphan claim and timed out. Recovery claims are
now unique per attempt, so old claim residue cannot deny subsequent recovery.

## Verification

- RED Full Verification `29315315463` retained only three of six process tokens.
- Orphan-claim RED Full Verification `29316494422` timed out on stale recovery.
- Repaired Full Verification `29316674532` passed maturity/design gates,
  typecheck, web build, core tests, Rust, and the full Playwright CLI suite.
- Storage Restore Drill `29316674452` passed.
- Storage Backup Retention `29316674522` passed.
- Deployment remains non-gating.

## Remaining Gaps

- A shared transactional identity database is still preferable for multi-host
  deployments.
- Remote-host stale locks intentionally require operator intervention because
  local PID checks cannot prove remote process death.
- MCP/UI token administration, audit events, and recovery workflows remain
  below Penpot maturity.
