# Authorization Audit Operations

Layo adapts Penpot's durable audit append/archive boundary to a team-owned PostgreSQL deployment. The application does not send audit events to a maintainer service.

## Roles

Use separate PostgreSQL credentials:

- Migration role: creates and alters the migration ledger, authorization state, audit table, indexes, and constraints.
- Runtime role: reads the migration ledger and reads/writes authorization state plus audit rows. It must not delete audit rows.
- Operator role: reads unarchived audit rows, marks exported ids archived, and deletes only archived rows selected by an explicit retention command.

Keep connection URLs outside the repository. Require TLS certificate verification for non-local databases, rotate credentials through the database platform, and bound pool and statement timeouts.

## Bootstrap And Restore

Migrate before starting shared mode:

```bash
pnpm --filter @layo/server authorization:migrate
```

Bootstrap requires an explicit operator identity and commits generation 1 with a `scope_bootstrapped` event:

```bash
pnpm --filter @layo/server authorization:bootstrap \
  --actor-user-id operator@example.com \
  --scope team-production \
  --base /private/members.json \
  --empty
```

Restore accepts only an absent scope, advances the artifact generation by one, and commits `scope_restored` in the same transaction:

```bash
pnpm --filter @layo/server authorization:restore \
  --actor-user-id operator@example.com \
  --scope team-production \
  --input /private/authorization-backup.json \
  --confirm-absent-scope-restore
```

A restore does not overwrite a live scope. The audit foreign key also prevents deleting a state scope while its audit rows remain.

## Export

Export unarchived events to a private versioned JSON artifact:

```bash
pnpm --filter @layo/server authorization:audit:export \
  --scope team-production \
  --output /private/audit-2026-07-16.json \
  --limit 500
```

The command writes a mode `0600` temporary file, fsyncs it, atomically replaces the destination, fsyncs the parent directory, and only then marks the exact exported ids archived. If the process fails after file replacement and before the database commit, rerun the command. Events may be exported again; stable decimal event ids are the deduplication key. Concurrent exporters can duplicate delivery but cannot mark an unselected id or delete a row.

Store exported artifacts with the authorization database backup. Verify file ownership, private permissions, expected scope, first/last event ids, and absence of credential fields before transfer.

## Retention

Preview retention first:

```bash
pnpm --filter @layo/server authorization:audit:retain \
  --scope team-production \
  --archived-before 2026-01-01T00:00:00.000Z \
  --keep-newest 1000 \
  --limit 500
```

Apply only after reviewing the returned candidate ids:

```bash
pnpm --filter @layo/server authorization:audit:retain \
  --scope team-production \
  --archived-before 2026-01-01T00:00:00.000Z \
  --keep-newest 1000 \
  --limit 500 \
  --apply
```

Deletion locks and revalidates every selected id in one scope. Any unarchived, missing, duplicate, cross-scope, or changed candidate aborts the transaction. Retention never selects or deletes unarchived events.

## Recovery Checks

After database recovery:

1. Run migrations with the migration role.
2. Verify the shared scope generation and base fingerprint before serving traffic.
3. Compare restored audit ids with the latest exported artifact.
4. Re-export unarchived rows and deduplicate by event id.
5. Dry-run retention; do not apply it during recovery validation.
6. Start the runtime and verify owner HTTP/MCP cursor reads fail closed for revoked or non-owner credentials.

`Authorization Backup Drill` proves state export/restore. `Authorization Audit Archive Drill` proves durable replacement, injected archive-commit retry, exact archive marking, and unarchived-row retention on PostgreSQL 16.
