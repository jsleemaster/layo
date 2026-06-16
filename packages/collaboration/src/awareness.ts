import { z } from "zod";

export interface CollaborationDocumentPoint {
  x: number;
  y: number;
  space: "document";
}

export interface CollaborationViewport {
  x: number;
  y: number;
  scale: number;
}

export interface CollaborationSelectionBounds extends CollaborationDocumentPoint {
  width: number;
  height: number;
  rotation: number;
}

export interface CollaborationPresence {
  sessionId: string;
  userId: string;
  displayName: string;
  color: string;
  selectedNodeId: string | null;
  selectedNodeBounds: CollaborationSelectionBounds | null;
  cursor: CollaborationDocumentPoint | null;
  viewport: CollaborationViewport | null;
  updatedAtMs: number | null;
  activeTool: string | null;
}

export type CollaborationDocumentPointInput = Omit<CollaborationDocumentPoint, "space"> &
  Partial<Pick<CollaborationDocumentPoint, "space">>;

export type CollaborationSelectionBoundsInput = Omit<CollaborationSelectionBounds, "space"> &
  Partial<Pick<CollaborationSelectionBounds, "space">>;

export interface CollaborationPresenceInput
  extends Partial<Omit<CollaborationPresence, "cursor" | "selectedNodeBounds">> {
  cursor?: CollaborationDocumentPointInput | null;
  selectedNodeBounds?: CollaborationSelectionBoundsInput | null;
}

const documentPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  space: z.literal("document").default("document")
});

const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number()
});

const selectionBoundsSchema = documentPointSchema.extend({
  width: z.number(),
  height: z.number(),
  rotation: z.number()
});

const presenceSchema = z
  .object({
    sessionId: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    color: z.string().trim().min(1),
    selectedNodeId: z.string().nullable().default(null),
    selectedNodeBounds: selectionBoundsSchema.nullable().default(null),
    cursor: documentPointSchema.nullable().default(null),
    viewport: viewportSchema.nullable().default(null),
    updatedAtMs: z.number().nullable().default(null),
    activeTool: z.string().nullable().default(null)
  })
  .transform((presence) => ({
    ...presence,
    sessionId: presence.sessionId ?? presence.userId
  }));

export function createPresenceState(input: CollaborationPresenceInput): CollaborationPresence {
  return presenceSchema.parse({
    selectedNodeId: null,
    cursor: null,
    selectedNodeBounds: null,
    viewport: null,
    updatedAtMs: null,
    activeTool: null,
    ...input
  });
}

export function summarizeAwarenessStates(states: unknown[]): CollaborationPresence[] {
  return states.flatMap((state) => {
    const parsed = presenceSchema.safeParse(state);
    return parsed.success ? [parsed.data] : [];
  });
}
