import { open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TeamAuthorizationAuditEvent } from "./team-authorization-postgres.js";

const MAX_BATCH_SIZE = 500;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;

export interface AuthorizationAuditOperatorStore {
  listUnarchivedAuditEvents(
    scope: string,
    options: { limit: number }
  ): Promise<TeamAuthorizationAuditEvent[]>;
  markAuditEventsArchived(scope: string, eventIds: string[]): Promise<void>;
  listArchivedAuditRetentionCandidates(
    scope: string,
    options: { archivedBefore: string; keepNewest: number; limit: number }
  ): Promise<string[]>;
  deleteArchivedAuditEvents(scope: string, eventIds: string[]): Promise<number>;
}

interface ExportAuthorizationAuditOptions {
  store: AuthorizationAuditOperatorStore;
  scope: string;
  outputPath: string;
  limit: number;
  now?: () => Date;
  afterDurableReplace?: () => void | Promise<void>;
}

interface AuthorizationAuditArtifact {
  version: 1;
  scope: string;
  exportedAt: string;
  events: TeamAuthorizationAuditEvent[];
}

function validateLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) {
    throw new Error(`authorization audit batch limit must be between 1 and ${MAX_BATCH_SIZE}`);
  }
  return limit;
}

function validateEventIds(eventIds: string[]): string[] {
  if (
    eventIds.some((id) => !POSITIVE_DECIMAL.test(id))
    || new Set(eventIds).size !== eventIds.length
  ) {
    throw new Error("authorization audit event ids must be unique positive decimal strings");
  }
  return eventIds;
}

function validateTimestamp(value: string, field: string): string {
  if (
    !value
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new Error(`authorization audit ${field} must be an ISO timestamp`);
  }
  return value;
}

async function writePrivateFileAtomically(
  outputPath: string,
  contents: string
): Promise<void> {
  const directory = path.dirname(outputPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  let temporary;
  try {
    temporary = await open(temporaryPath, "wx", 0o600);
    await temporary.writeFile(contents, "utf8");
    await temporary.sync();
    await temporary.close();
    temporary = undefined;
    await rename(temporaryPath, outputPath);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await temporary?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function exportAuthorizationAuditEvents(
  options: ExportAuthorizationAuditOptions
): Promise<{
  outputPath: string;
  exportedCount: number;
  firstEventId?: string;
  lastEventId?: string;
}> {
  if (!options.outputPath.trim()) {
    throw new Error("authorization audit output path must not be blank");
  }
  const limit = validateLimit(options.limit);
  const events = await options.store.listUnarchivedAuditEvents(
    options.scope,
    { limit }
  );
  const eventIds = validateEventIds(events.map((event) => event.id));
  if (events.some((event) => event.scope !== options.scope)) {
    throw new Error("authorization audit export returned a cross-scope event");
  }
  const exportedAt = validateTimestamp(
    (options.now ?? (() => new Date()))().toISOString(),
    "exportedAt"
  );
  const artifact: AuthorizationAuditArtifact = {
    version: 1,
    scope: options.scope,
    exportedAt,
    events
  };

  await writePrivateFileAtomically(
    options.outputPath,
    `${JSON.stringify(artifact, null, 2)}\n`
  );
  await options.afterDurableReplace?.();
  if (eventIds.length > 0) {
    await options.store.markAuditEventsArchived(options.scope, eventIds);
  }

  return {
    outputPath: options.outputPath,
    exportedCount: events.length,
    firstEventId: eventIds[0],
    lastEventId: eventIds.at(-1)
  };
}

interface AuthorizationAuditRetentionOptions {
  store: AuthorizationAuditOperatorStore;
  scope: string;
  archivedBefore: string;
  keepNewest: number;
  limit: number;
  apply: boolean;
}

export async function applyAuthorizationAuditRetention(
  options: AuthorizationAuditRetentionOptions
): Promise<{
  candidateIds: string[];
  deletedCount: number;
  applied: boolean;
}> {
  const archivedBefore = validateTimestamp(
    options.archivedBefore,
    "archivedBefore"
  );
  if (!Number.isSafeInteger(options.keepNewest) || options.keepNewest < 0) {
    throw new Error("authorization audit keepNewest must be a nonnegative integer");
  }
  const limit = validateLimit(options.limit);
  const candidateIds = validateEventIds(
    await options.store.listArchivedAuditRetentionCandidates(
      options.scope,
      {
        archivedBefore,
        keepNewest: options.keepNewest,
        limit
      }
    )
  );
  if (!options.apply || candidateIds.length === 0) {
    return { candidateIds, deletedCount: 0, applied: false };
  }
  const deletedCount = await options.store.deleteArchivedAuditEvents(
    options.scope,
    candidateIds
  );
  if (deletedCount !== candidateIds.length) {
    throw new Error("authorization audit retention did not delete every selected archived event");
  }
  return { candidateIds, deletedCount, applied: true };
}
