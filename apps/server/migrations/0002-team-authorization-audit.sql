-- Purpose: append secret-free authorization mutations beside their committed generation.
CREATE TABLE IF NOT EXISTS layo_authorization_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL REFERENCES layo_team_authorization_state(scope) ON DELETE RESTRICT,
  generation bigint NOT NULL CHECK (generation > 0),
  action text NOT NULL CHECK (
    action IN (
      'token_created',
      'token_revoked',
      'scope_bootstrapped',
      'scope_restored',
      'base_reconciled'
    )
  ),
  actor_user_id text NOT NULL CHECK (
    actor_user_id = btrim(actor_user_id)
    AND octet_length(actor_user_id) BETWEEN 1 AND 512
  ),
  subject_token_id text NULL CHECK (
    subject_token_id IS NULL
    OR (
      subject_token_id = btrim(subject_token_id)
      AND octet_length(subject_token_id) BETWEEN 1 AND 512
    )
  ),
  subject_token_name text NULL CHECK (
    subject_token_name IS NULL
    OR octet_length(subject_token_name) BETWEEN 1 AND 512
  ),
  source text NOT NULL CHECK (source IN ('http', 'mcp', 'operator')),
  request_id text NULL CHECK (
    request_id IS NULL
    OR (
      request_id = btrim(request_id)
      AND octet_length(request_id) BETWEEN 1 AND 512
    )
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(metadata) = 'object'
    AND octet_length(metadata::text) <= 16384
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz NULL,
  UNIQUE (scope, generation)
);

-- Purpose: serve stable owner cursors and unarchived operator export without table scans.
CREATE INDEX IF NOT EXISTS layo_authorization_audit_scope_id_idx
  ON layo_authorization_audit_events (scope, id);
CREATE INDEX IF NOT EXISTS layo_authorization_audit_unarchived_idx
  ON layo_authorization_audit_events (scope, id)
  WHERE archived_at IS NULL;

-- Purpose: mark the audit schema only after every table and index exists.
INSERT INTO layo_authorization_schema_migrations (version)
VALUES (2)
ON CONFLICT (version) DO NOTHING;
