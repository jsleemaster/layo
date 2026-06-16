import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import {
  createCollaborativeDesignDocument,
  createDocumentRoomId,
  createPresenceState,
  summarizeAwarenessStates,
  type CollaborationPresence,
  type TeamManifest
} from "@canvas-mcp-editor/collaboration";
import { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

export type CollabConnectionStatus = "offline" | "connecting" | "synced" | "error";

export interface CollaborationProviderInput {
  relayUrl: string;
  roomId: string;
  token?: string;
  userId: string;
  memberToken?: string;
  access: "sync" | "awareness";
  ydoc: Y.Doc;
  initialPresence: CollaborationPresence;
}

export interface CollaborationProvider {
  onStatus(listener: (status: CollabConnectionStatus) => void): void;
  onPresence(listener: () => void): () => void;
  updatePresence(presence: CollaborationPresence): void;
  getPresence(): CollaborationPresence[];
  destroy(): void;
}

export type CollaborationProviderFactory = (input: CollaborationProviderInput) => CollaborationProvider;

export interface CollabDocumentSession {
  team: TeamManifest;
  documentId: string;
  readonly status: CollabConnectionStatus;
  getDocument(): RendererDocument;
  transact(label: string, apply: (document: RendererDocument) => RendererDocument): void;
  subscribe(listener: (document: RendererDocument) => void): () => void;
  subscribeStatus(listener: (status: CollabConnectionStatus) => void): () => void;
  subscribePresence(listener: (presence: CollaborationPresence[]) => void): () => void;
  updatePresence(patch: Partial<CollaborationPresence>): void;
  getLocalPresence(): CollaborationPresence;
  getPresence(): CollaborationPresence[];
  destroy(): void;
}

export interface CreateCollabDocumentSessionInput {
  team: TeamManifest;
  documentId: string;
  initialDocument: RendererDocument;
  relayToken?: string;
  memberToken?: string;
  enablePersistence?: boolean;
  providerFactory?: CollaborationProviderFactory;
}

export function createCollabDocumentSession(
  input: CreateCollabDocumentSessionInput
): CollabDocumentSession {
  const document = createCollaborativeDesignDocument({ document: input.initialDocument });
  const sessionId = createPresenceSessionId(input.team.currentUserId);
  const localPresence = createPresenceState({
    ...input.team.members.find((member) => member.userId === input.team.currentUserId),
    userId: input.team.currentUserId,
    sessionId
  });
  const currentMember = input.team.members.find((member) => member.userId === input.team.currentUserId);
  const access = currentMember?.role === "viewer" ? "awareness" : "sync";
  const localPresenceState = { current: localPresence };
  let status: CollabConnectionStatus = input.team.sync.mode === "websocket" ? "connecting" : "offline";
  let provider: CollaborationProvider | null = null;
  let persistence: { destroy(): Promise<void> | void } | null = null;
  const statusListeners = new Set<(status: CollabConnectionStatus) => void>();
  const presenceListeners = new Set<(presence: CollaborationPresence[]) => void>();
  const notifyPresence = () => {
    const nextPresence = getPresence();
    for (const listener of presenceListeners) {
      listener(nextPresence);
    }
  };

  if (input.enablePersistence ?? true) {
    persistence = new IndexeddbPersistence(
      createDocumentRoomId(input.team.teamId, input.documentId),
      document.ydoc
    );
  }

  if (input.team.sync.mode === "websocket") {
    provider = (input.providerFactory ?? createDefaultProvider)({
      relayUrl: input.team.sync.relayUrl,
      roomId: createDocumentRoomId(input.team.teamId, input.documentId),
      token: input.relayToken,
      userId: input.team.currentUserId,
      memberToken: input.memberToken,
      access,
      ydoc: document.ydoc,
      initialPresence: localPresence
    });
    provider.onStatus((nextStatus) => {
      status = nextStatus;
      for (const listener of statusListeners) {
        listener(status);
      }
    });
    provider.onPresence(notifyPresence);
  }

  function getPresence() {
    if (provider) {
      const remotePresence = provider.getPresence();
      return remotePresence.length ? remotePresence : [localPresenceState.current];
    }

    return [localPresenceState.current];
  }

  return {
    team: input.team,
    documentId: input.documentId,
    get status() {
      return status;
    },
    getDocument: document.getDocument,
    transact: document.transact,
    subscribe: document.subscribe,
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    subscribePresence(listener) {
      presenceListeners.add(listener);
      return () => {
        presenceListeners.delete(listener);
      };
    },
    updatePresence(patch) {
      localPresenceState.current = createPresenceState({
        ...localPresenceState.current,
        ...patch
      });
      provider?.updatePresence(localPresenceState.current);
      notifyPresence();
    },
    getLocalPresence() {
      return localPresenceState.current;
    },
    getPresence,
    destroy() {
      statusListeners.clear();
      presenceListeners.clear();
      provider?.destroy();
      void persistence?.destroy();
      document.destroy();
    }
  };
}

function createPresenceSessionId(userId: string): string {
  return `presence-${userId}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function createDefaultProvider(input: CollaborationProviderInput): CollaborationProvider {
  const awareness = new Awareness(input.ydoc);
  awareness.setLocalState(input.initialPresence);
  const provider = new WebsocketProvider(input.relayUrl, input.roomId, input.ydoc, {
    awareness,
    params: {
      ...(input.token ? { token: input.token } : {}),
      userId: input.userId,
      ...(input.memberToken ? { memberToken: input.memberToken } : {}),
      access: input.access
    }
  });
  const statusListeners = new Set<(status: CollabConnectionStatus) => void>();
  const presenceListeners = new Set<() => void>();

  provider.on("status", (event: { status: "connected" | "disconnected" | "connecting" }) => {
    const nextStatus =
      event.status === "connected" ? "synced" : event.status === "disconnected" ? "offline" : "connecting";
    for (const listener of statusListeners) {
      listener(nextStatus);
    }
  });
  provider.on("connection-error", () => {
    for (const listener of statusListeners) {
      listener("error");
    }
  });
  awareness.on("change", () => {
    for (const listener of presenceListeners) {
      listener();
    }
  });

  return {
    onStatus(listener) {
      statusListeners.add(listener);
    },
    onPresence(listener) {
      presenceListeners.add(listener);
      return () => {
        presenceListeners.delete(listener);
      };
    },
    updatePresence(presence) {
      awareness.setLocalState(presence);
    },
    getPresence() {
      return summarizeAwarenessStates(Array.from(awareness.getStates().values()));
    },
    destroy() {
      statusListeners.clear();
      presenceListeners.clear();
      provider.destroy();
      awareness.destroy();
    }
  };
}
