import { z } from "zod";

export interface TeamMember {
  userId: string;
  displayName: string;
  color: string;
  role: TeamRole;
}

export type TeamRole = "owner" | "editor" | "viewer";

export interface TeamDocumentSummary {
  documentId: string;
  name: string;
  updatedAt: string;
}

export type TeamSyncConfig =
  | {
      mode: "local";
      roomPrefix: string;
    }
  | {
      mode: "websocket";
      roomPrefix: string;
      relayUrl: string;
    };

export interface TeamPermissions {
  canEdit: boolean;
  canInvite: boolean;
}

export interface RelayMemberTokenHash {
  userId: string;
  tokenHash: string;
  role: TeamRole;
}

export interface RelayInviteTokenHash {
  inviteId: string;
  tokenHash: string;
  role: Exclude<TeamRole, "owner">;
  expiresAt?: string;
}

export interface TeamAuthMetadata {
  relay: {
    memberTokenHashes: RelayMemberTokenHash[];
    inviteTokenHashes: RelayInviteTokenHash[];
  };
}

export type TeamEncryptionConfig =
  | {
      mode: "none";
    }
  | {
      mode: "shared-key";
      algorithm: "AES-GCM";
      kdf: "PBKDF2-SHA-256";
      salt: string;
      iterations: number;
    };

export type SharedKeyEncryptionConfig = Extract<TeamEncryptionConfig, { mode: "shared-key" }>;

export const TEAM_MANIFEST_SCHEMA_VERSION = 1;

export interface TeamManifest {
  schemaVersion: typeof TEAM_MANIFEST_SCHEMA_VERSION;
  teamId: string;
  name: string;
  createdAt: string;
  currentUserId: string;
  members: TeamMember[];
  documents: TeamDocumentSummary[];
  sync: TeamSyncConfig;
  permissions: TeamPermissions;
  auth: TeamAuthMetadata;
  encryption: TeamEncryptionConfig;
}

export interface CreateTeamManifestInput {
  name: string;
  currentUser: Omit<TeamMember, "role"> & { role?: TeamRole };
  members?: Array<Omit<TeamMember, "role"> & { role?: TeamRole }>;
  teamId?: string;
  createdAt?: string;
  documents?: TeamDocumentSummary[];
  sync?: (Partial<TeamSyncConfig> & { mode: TeamSyncConfig["mode"] }) & {
    token?: string;
    memberTokenHashes?: RelayMemberTokenHash[];
    inviteTokenHashes?: RelayInviteTokenHash[];
  };
  permissions?: Partial<TeamPermissions>;
  encryption?: TeamEncryptionConfig;
}

const teamMemberSchema = z.object({
  userId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  color: z.string().trim().min(1),
  role: z.enum(["owner", "editor", "viewer"])
});

const teamDocumentSummarySchema = z.object({
  documentId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
});

const teamSyncConfigSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("local"),
    roomPrefix: z.string().trim().min(1)
  }),
  z.object({
    mode: z.literal("websocket"),
    roomPrefix: z.string().trim().min(1),
    relayUrl: z.string().trim().min(1)
  })
]);

const relayMemberTokenHashSchema = z.object({
  userId: z.string().trim().min(1),
  tokenHash: z.string().trim().min(1),
  role: z.enum(["owner", "editor", "viewer"])
});

const relayInviteTokenHashSchema = z.object({
  inviteId: z.string().trim().min(1),
  tokenHash: z.string().trim().min(1),
  role: z.enum(["editor", "viewer"]),
  expiresAt: z.string().trim().min(1).optional()
});

const teamAuthMetadataSchema = z.object({
  relay: z.object({
    memberTokenHashes: z.array(relayMemberTokenHashSchema),
    inviteTokenHashes: z.array(relayInviteTokenHashSchema)
  })
});

const teamEncryptionConfigSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("none")
  }),
  z.object({
    mode: z.literal("shared-key"),
    algorithm: z.literal("AES-GCM"),
    kdf: z.literal("PBKDF2-SHA-256"),
    salt: z.string().trim().min(1),
    iterations: z.number().int().min(1)
  })
]);

const teamManifestSchema = z.object({
  schemaVersion: z.literal(TEAM_MANIFEST_SCHEMA_VERSION),
  teamId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  currentUserId: z.string().trim().min(1),
  members: z.array(teamMemberSchema).min(1),
  documents: z.array(teamDocumentSummarySchema),
  sync: teamSyncConfigSchema,
  permissions: z.object({
    canEdit: z.boolean(),
    canInvite: z.boolean()
  }),
  auth: teamAuthMetadataSchema,
  encryption: teamEncryptionConfigSchema.default({ mode: "none" })
});

const DEFAULT_ROOM_PREFIX = "layo";
const DEFAULT_E2EE_ITERATIONS = 210000;

export type TeamManifestValidationResult =
  | {
      ok: true;
      team: TeamManifest;
    }
  | {
      ok: false;
      message: string;
      issues: string[];
    };

export function createTeamManifest(input: CreateTeamManifestInput): TeamManifest {
  const name = input.name.trim();
  if (!name) {
    throw new Error("team name is required");
  }

  const sync = normalizeSyncConfig(input.sync);
  const currentUser = normalizeTeamMember(input.currentUser, "owner");
  const members = [
    currentUser,
    ...(input.members ?? []).map((member) => normalizeTeamMember(member, "editor"))
  ];
  const team: TeamManifest = {
    schemaVersion: TEAM_MANIFEST_SCHEMA_VERSION,
    teamId: input.teamId ?? createId("team"),
    name,
    createdAt: input.createdAt ?? new Date().toISOString(),
    currentUserId: currentUser.userId,
    members: dedupeMembers(members),
    documents: input.documents ?? [],
    sync,
    permissions: {
      canEdit: input.permissions?.canEdit ?? currentUser.role !== "viewer",
      canInvite: input.permissions?.canInvite ?? currentUser.role === "owner"
    },
    auth: {
      relay: {
        memberTokenHashes: input.sync?.memberTokenHashes ?? [],
        inviteTokenHashes: input.sync?.inviteTokenHashes ?? []
      }
    },
    encryption: input.encryption ?? { mode: "none" }
  };

  return parseTeamManifest(team);
}

export function createSharedKeyEncryptionConfig(
  input: { salt?: string; iterations?: number } = {}
): SharedKeyEncryptionConfig {
  const salt = input.salt?.trim() || createRandomSalt();
  const iterations = input.iterations ?? DEFAULT_E2EE_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("encryption iterations must be a positive integer");
  }

  return {
    mode: "shared-key",
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    salt,
    iterations
  };
}

export function parseTeamManifest(input: unknown): TeamManifest {
  const migrated = migrateTeamManifest(input);
  const parsed = teamManifestSchema.safeParse(migrated);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.path.join(".") || issue.message);
    throw new Error(`invalid team manifest: ${issues.join(", ")}`);
  }

  return parsed.data;
}

export function validateTeamManifest(input: unknown): TeamManifestValidationResult {
  try {
    return {
      ok: true,
      team: parseTeamManifest(input)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid team manifest";
    return {
      ok: false,
      message,
      issues: issuesFromValidationMessage(message)
    };
  }
}

export function migrateTeamManifest(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const schemaVersion = input.schemaVersion;
  if (schemaVersion === undefined || schemaVersion === 0) {
    return migrateLegacyTeamManifest(input);
  }

  if (schemaVersion !== TEAM_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`unsupported team manifest schema version: ${String(schemaVersion)}`);
  }

  return stripPlaintextManifestSecrets(input);
}

function normalizeSyncConfig(input: CreateTeamManifestInput["sync"]): TeamSyncConfig {
  if (!input || input.mode === "local") {
    return {
      mode: "local",
      roomPrefix: input?.roomPrefix ?? DEFAULT_ROOM_PREFIX
    };
  }

  if (!input.relayUrl) {
    throw new Error("relayUrl is required for websocket sync");
  }

  return {
    mode: "websocket",
    roomPrefix: input.roomPrefix ?? DEFAULT_ROOM_PREFIX,
    relayUrl: input.relayUrl
  };
}

function normalizeTeamMember(
  member: Omit<TeamMember, "role"> & { role?: TeamRole },
  defaultRole: TeamRole
): TeamMember {
  return {
    ...member,
    role: member.role ?? defaultRole
  };
}

function dedupeMembers(members: TeamMember[]): TeamMember[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    if (seen.has(member.userId)) {
      return false;
    }
    seen.add(member.userId);
    return true;
  });
}

function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function migrateLegacyTeamManifest(input: Record<string, unknown>): TeamManifest {
  const currentUserId = String(input.currentUserId ?? "");
  const rawMembers = Array.isArray(input.members) ? input.members : [];
  const members = rawMembers.flatMap((member) => {
    if (!isRecord(member)) {
      return [];
    }

    const userId = String(member.userId ?? "");
    if (!userId) {
      return [];
    }

    return [
      normalizeTeamMember(
        {
          userId,
          displayName: String(member.displayName ?? userId),
          color: String(member.color ?? "#6d5efc"),
          role: typeof member.role === "string" ? (member.role as TeamRole) : undefined
        },
        userId === currentUserId ? "owner" : "editor"
      )
    ];
  });
  const sync = normalizeMigratedSyncConfig(input.sync);
  const auth = normalizeMigratedAuthMetadata(input.auth);
  const currentMember = members.find((member) => member.userId === currentUserId) ?? members[0];

  return {
    schemaVersion: TEAM_MANIFEST_SCHEMA_VERSION,
    teamId: String(input.teamId ?? ""),
    name: String(input.name ?? ""),
    createdAt: String(input.createdAt ?? new Date().toISOString()),
    currentUserId,
    members: dedupeMembers(members),
    documents: Array.isArray(input.documents) ? input.documents : [],
    sync,
    permissions: normalizeMigratedPermissions(input.permissions, currentMember),
    auth,
    encryption: normalizeMigratedEncryption(input.encryption)
  };
}

function normalizeMigratedSyncConfig(input: unknown): TeamSyncConfig {
  if (!isRecord(input) || input.mode !== "websocket") {
    return {
      mode: "local",
      roomPrefix: isRecord(input) && typeof input.roomPrefix === "string" ? input.roomPrefix : DEFAULT_ROOM_PREFIX
    };
  }

  return {
    mode: "websocket",
    roomPrefix: typeof input.roomPrefix === "string" ? input.roomPrefix : DEFAULT_ROOM_PREFIX,
    relayUrl: String(input.relayUrl ?? "")
  };
}

function normalizeMigratedPermissions(input: unknown, currentMember: TeamMember | undefined): TeamPermissions {
  if (isRecord(input) && typeof input.canEdit === "boolean" && typeof input.canInvite === "boolean") {
    return {
      canEdit: input.canEdit,
      canInvite: input.canInvite
    };
  }

  return {
    canEdit: currentMember?.role !== "viewer",
    canInvite: currentMember?.role === "owner"
  };
}

function normalizeMigratedAuthMetadata(input: unknown): TeamAuthMetadata {
  const relay = isRecord(input) && isRecord(input.relay) ? input.relay : {};
  const memberTokenHashes = Array.isArray(relay.memberTokenHashes)
    ? relay.memberTokenHashes.filter(isRelayMemberTokenHash)
    : [];
  const inviteTokenHashes = Array.isArray(relay.inviteTokenHashes)
    ? relay.inviteTokenHashes.filter(isRelayInviteTokenHash)
    : [];

  return {
    relay: {
      memberTokenHashes,
      inviteTokenHashes
    }
  };
}

function normalizeMigratedEncryption(input: unknown): TeamEncryptionConfig {
  if (!isRecord(input)) {
    return { mode: "none" };
  }

  const stripped = stripPlaintextManifestSecrets(input);
  const parsed = teamEncryptionConfigSchema.safeParse(stripped);
  return parsed.success ? parsed.data : { mode: "none" };
}

function stripPlaintextManifestSecrets(input: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(input) as Record<string, unknown>;
  stripSecretsFromRecord(clone);
  return clone;
}

function stripSecretsFromRecord(record: Record<string, unknown>) {
  for (const key of Object.keys(record)) {
    if (isPlaintextSecretKey(key)) {
      delete record[key];
      continue;
    }

    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item)) {
          stripSecretsFromRecord(item);
        }
      }
    } else if (isRecord(value)) {
      stripSecretsFromRecord(value);
    }
  }
}

function isPlaintextSecretKey(key: string): boolean {
  return [
    "token",
    "memberToken",
    "relayToken",
    "inviteToken",
    "passphrase",
    "encryptionKey",
    "derivedKey"
  ].includes(key);
}

function createRandomSalt(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function issuesFromValidationMessage(message: string): string[] {
  if (message.startsWith("unsupported team manifest schema version")) {
    return ["schemaVersion"];
  }

  return message
    .replace(/^invalid team manifest: /, "")
    .split(",")
    .map((issue) => issue.trim().split(".")[0])
    .filter(Boolean)
    .filter((issue, index, issues) => issues.indexOf(issue) === index);
}

function isRelayMemberTokenHash(input: unknown): input is RelayMemberTokenHash {
  return relayMemberTokenHashSchema.safeParse(input).success;
}

function isRelayInviteTokenHash(input: unknown): input is RelayInviteTokenHash {
  return relayInviteTokenHashSchema.safeParse(input).success;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
