-- Purpose: record ordered authorization schema changes owned by the migration role.
CREATE TABLE IF NOT EXISTS layo_authorization_schema_migrations (
  version integer PRIMARY KEY CHECK (version > 0),
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Purpose: keep one bounded, hash-only authorization generation per team-owned scope.
CREATE TABLE IF NOT EXISTS layo_team_authorization_state (
  scope text PRIMARY KEY,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  base_fingerprint text NOT NULL CHECK (base_fingerprint ~ '^[0-9a-f]{64}$'),
  state jsonb NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT layo_team_authorization_scope_format
    CHECK (
      scope = btrim(scope)
      AND octet_length(scope) BETWEEN 1 AND 512
      AND scope ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    ),
  CONSTRAINT layo_team_authorization_state_size
    CHECK (octet_length(state::text) <= 1048576)
);

-- Purpose: mark this idempotent migration after its DDL is present.
INSERT INTO layo_authorization_schema_migrations (version)
VALUES (1)
ON CONFLICT (version) DO NOTHING;
