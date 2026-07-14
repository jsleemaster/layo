# Penpot Token Process Lock Plan

Date: 2026-07-14
Status: Active in PR #307

## Benchmark Decision

Penpot-comparable personal access token administration must not lose committed
credentials when a self-hosted team runs more than one server process. Layo
adapts that durability requirement to its operator-owned JSON authority with a
resource-keyed filesystem lock rather than introducing a maintainer-operated
identity service.

## Failed Case

Six independent Node processes were released together and created distinct
tokens against one authorization file. RED Full Verification `29315315463`
retained only three of six records, proving atomic rename alone did not make the
read-modify-write transaction safe.

## Scope

- Serialize the complete authorization read-modify-write operation across
  processes and manager instances.
- Keep an in-process queue for same-runtime fairness.
- Record lock ownership with a random token, PID, hostname, and acquisition time.
- Recover only stale locks owned by terminated processes on the same host.
- Use per-attempt recovery claims so a crashed recoverer cannot permanently
  block later recovery.
- Never steal a live or remote-host lock.
- Bound contention with configurable timeout and stale thresholds.
- Preserve one-time secret and hash-only persistence behavior from PR #306.
- Keep hosted transactional identity storage as a later maturity step.

## Verification

- Six-process creation regression requires all six token IDs.
- Unit tests cover abandoned same-host recovery and live-lock timeout.
- Full Verification, restore, retention, external review, and final docs gate
  merge.
- Deployment remains non-gating.
