import type { RendererDocument } from "./index.js";

const SNAPSHOT_MISSING = Symbol("snapshot-missing");

export class DocumentSnapshotConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentSnapshotConflictError";
  }
}

export interface DocumentSnapshotMergeOptions {
  conflictPreference?: "local" | "current";
}

export function mergeConcurrentDocumentSnapshots<T extends RendererDocument>(
  base: T,
  local: T,
  current: T,
  options: DocumentSnapshotMergeOptions = {}
): T {
  if (!base || typeof base !== "object" || !Array.isArray(base.pages)) {
    throw new DocumentSnapshotConflictError("base document snapshot is required");
  }
  const merged = mergeConcurrentSnapshotValue(
    base,
    local,
    current,
    "document",
    options.conflictPreference ?? "error"
  );
  if (!isSnapshotRecord(merged)) {
    throw new DocumentSnapshotConflictError("document snapshot merge produced an invalid document");
  }
  return structuredClone(merged) as unknown as T;
}

function mergeConcurrentSnapshotValue(
  base: unknown | typeof SNAPSHOT_MISSING,
  local: unknown | typeof SNAPSHOT_MISSING,
  current: unknown | typeof SNAPSHOT_MISSING,
  valuePath: string,
  conflictPreference: "error" | "local" | "current"
): unknown | typeof SNAPSHOT_MISSING {
  if (snapshotValuesEqual(local, base)) {
    return cloneSnapshotValue(current);
  }
  if (snapshotValuesEqual(current, base) || snapshotValuesEqual(local, current)) {
    return cloneSnapshotValue(local);
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(current)) {
    if (isStableIdSnapshotArray(base, local, current)) {
      return mergeStableIdSnapshotArray(
        base as Array<Record<string, unknown>>,
        local as Array<Record<string, unknown>>,
        current as Array<Record<string, unknown>>,
        valuePath,
        conflictPreference
      );
    }
    return resolveSnapshotConflict(local, current, valuePath, conflictPreference);
  }

  if (isSnapshotRecord(base) && isSnapshotRecord(local) && isSnapshotRecord(current)) {
    const merged: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(current)]);
    for (const key of keys) {
      const nextValue = mergeConcurrentSnapshotValue(
        Object.hasOwn(base, key) ? base[key] : SNAPSHOT_MISSING,
        Object.hasOwn(local, key) ? local[key] : SNAPSHOT_MISSING,
        Object.hasOwn(current, key) ? current[key] : SNAPSHOT_MISSING,
        `${valuePath}.${key}`,
        conflictPreference
      );
      if (nextValue !== SNAPSHOT_MISSING) {
        merged[key] = nextValue;
      }
    }
    return merged;
  }

  return resolveSnapshotConflict(local, current, valuePath, conflictPreference);
}

function mergeStableIdSnapshotArray(
  base: Array<Record<string, unknown>>,
  local: Array<Record<string, unknown>>,
  current: Array<Record<string, unknown>>,
  valuePath: string,
  conflictPreference: "error" | "local" | "current"
): unknown[] {
  const baseById = new Map(base.map((item) => [String(item.id), item]));
  const localById = new Map(local.map((item) => [String(item.id), item]));
  const currentById = new Map(current.map((item) => [String(item.id), item]));
  const mergedById = new Map<string, unknown>();
  const allIds = new Set([...baseById.keys(), ...localById.keys(), ...currentById.keys()]);

  for (const itemId of allIds) {
    const merged = mergeConcurrentSnapshotValue(
      baseById.get(itemId) ?? SNAPSHOT_MISSING,
      localById.get(itemId) ?? SNAPSHOT_MISSING,
      currentById.get(itemId) ?? SNAPSHOT_MISSING,
      `${valuePath}[${itemId}]`,
      conflictPreference
    );
    if (merged !== SNAPSHOT_MISSING) {
      mergedById.set(itemId, merged);
    }
  }

  const baseOrder = base.map((item) => String(item.id));
  const localOrder = local.map((item) => String(item.id));
  const currentOrder = current.map((item) => String(item.id));
  const commonBaseIds = new Set(
    baseOrder.filter((itemId) => localById.has(itemId) && currentById.has(itemId) && mergedById.has(itemId))
  );
  const baseCommonOrder = baseOrder.filter((itemId) => commonBaseIds.has(itemId));
  const localCommonOrder = localOrder.filter((itemId) => commonBaseIds.has(itemId));
  const currentCommonOrder = currentOrder.filter((itemId) => commonBaseIds.has(itemId));
  const localReordered = !snapshotValuesEqual(localCommonOrder, baseCommonOrder);
  const currentReordered = !snapshotValuesEqual(currentCommonOrder, baseCommonOrder);
  const hasDivergentReorder =
    localReordered &&
    currentReordered &&
    !snapshotValuesEqual(localCommonOrder, currentCommonOrder);
  if (hasDivergentReorder && conflictPreference === "error") {
    throw new DocumentSnapshotConflictError(`document snapshot conflict at ${valuePath}`);
  }

  let mergedOrder: string[];
  if (hasDivergentReorder) {
    mergedOrder = mergePreferredSnapshotOrder(
      conflictPreference === "local" ? localOrder : currentOrder,
      conflictPreference === "local" ? currentOrder : localOrder
    );
  } else if (snapshotValuesEqual(localOrder, baseOrder)) {
    mergedOrder = [...currentOrder];
  } else if (snapshotValuesEqual(currentOrder, baseOrder)) {
    mergedOrder = [...localOrder];
  } else if (snapshotValuesEqual(localOrder, currentOrder)) {
    mergedOrder = [...localOrder];
  } else {
    const preferLocalOrder = conflictPreference === "local" || (conflictPreference === "error" && localReordered);
    const primaryOrder = preferLocalOrder ? localOrder : currentOrder;
    const secondaryOrder = preferLocalOrder ? currentOrder : localOrder;
    mergedOrder = mergePreferredSnapshotOrder(primaryOrder, secondaryOrder);
  }

  const finalOrder = [
    ...mergedOrder.filter((itemId) => mergedById.has(itemId)),
    ...Array.from(mergedById.keys()).filter((itemId) => !mergedOrder.includes(itemId)).sort()
  ];
  if (conflictPreference === "error") {
    assertConcurrentInsertionOrderPreserved(baseById, localOrder, finalOrder, mergedById, valuePath);
    assertConcurrentInsertionOrderPreserved(baseById, currentOrder, finalOrder, mergedById, valuePath);
  }
  return finalOrder.map((itemId) => cloneSnapshotValue(mergedById.get(itemId)));
}

function mergePreferredSnapshotOrder(primaryOrder: string[], secondaryOrder: string[]): string[] {
  const mergedOrder = [...primaryOrder];
  for (const itemId of secondaryOrder) {
    if (mergedOrder.includes(itemId)) {
      continue;
    }
    const secondaryIndex = secondaryOrder.indexOf(itemId);
    const previousNeighbor = secondaryOrder
      .slice(0, secondaryIndex)
      .reverse()
      .find((candidateId) => mergedOrder.includes(candidateId));
    if (previousNeighbor) {
      mergedOrder.splice(mergedOrder.indexOf(previousNeighbor) + 1, 0, itemId);
      continue;
    }
    const nextNeighbor = secondaryOrder
      .slice(secondaryIndex + 1)
      .find((candidateId) => mergedOrder.includes(candidateId));
    mergedOrder.splice(nextNeighbor ? mergedOrder.indexOf(nextNeighbor) : mergedOrder.length, 0, itemId);
  }
  return mergedOrder;
}

function resolveSnapshotConflict<T>(
  local: T,
  current: T,
  valuePath: string,
  conflictPreference: "error" | "local" | "current"
): T {
  if (conflictPreference === "local") {
    return cloneSnapshotValue(local);
  }
  if (conflictPreference === "current") {
    return cloneSnapshotValue(current);
  }
  throw new DocumentSnapshotConflictError(`document snapshot conflict at ${valuePath}`);
}

function assertConcurrentInsertionOrderPreserved(
  baseById: ReadonlyMap<string, Record<string, unknown>>,
  sideOrder: string[],
  mergedOrder: string[],
  mergedById: ReadonlyMap<string, unknown>,
  valuePath: string
): void {
  const mergedIndexById = new Map(mergedOrder.map((itemId, index) => [itemId, index]));
  const survivingSideOrder = sideOrder.filter((itemId) => mergedById.has(itemId));
  for (let index = 0; index < survivingSideOrder.length - 1; index += 1) {
    const firstId = survivingSideOrder[index]!;
    const secondId = survivingSideOrder[index + 1]!;
    if (baseById.has(firstId) && baseById.has(secondId)) {
      continue;
    }
    if (mergedIndexById.get(firstId)! > mergedIndexById.get(secondId)!) {
      throw new DocumentSnapshotConflictError(`document snapshot conflict at ${valuePath}`);
    }
  }
}

function isStableIdSnapshotArray(...values: unknown[][]): boolean {
  const items = values.flat();
  return items.every((item) => isSnapshotRecord(item) && typeof item.id === "string");
}

function isSnapshotRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotValuesEqual(first: unknown, second: unknown): boolean {
  if (first === SNAPSHOT_MISSING || second === SNAPSHOT_MISSING) {
    return first === second;
  }
  return JSON.stringify(first) === JSON.stringify(second);
}

function cloneSnapshotValue<T>(value: T): T {
  return value === SNAPSHOT_MISSING ? value : structuredClone(value);
}
