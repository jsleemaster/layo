import {
  createCollaborativeDesignDocument,
  createDocumentRoomId
} from "@layo/collaboration";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import {
  applyAgentCommandsToDocument,
  type AgentCollaborationTarget,
  type AgentCommand
} from "./agent-control.js";
import type { DesignFile } from "./storage.js";

export interface CollaborativeAgentCommandResult {
  before: DesignFile;
  preview: DesignFile;
  changedNodeIds: string[];
}

export async function applyAgentCommandsToCollaboration(input: {
  target: AgentCollaborationTarget;
  fallbackDocument: DesignFile;
  commands: AgentCommand[];
  timeoutMs?: number;
}): Promise<CollaborativeAgentCommandResult> {
  const ydoc = new Y.Doc();
  const roomId = createDocumentRoomId(input.target.teamId, input.target.documentId);
  const provider = new WebsocketProvider(input.target.relayUrl, roomId, ydoc, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    disableBc: true,
    params: {
      ...(input.target.token ? { token: input.target.token } : {}),
      ...(input.target.userId ? { userId: input.target.userId } : {}),
      ...(input.target.memberToken ? { memberToken: input.target.memberToken } : {}),
      access: "sync"
    }
  });
  const document = createCollaborativeDesignDocument({ ydoc });

  try {
    await waitForProviderSync(provider, input.timeoutMs ?? 5000);
    const before = readRemoteDocumentOrFallback(document, input.fallbackDocument);
    if (!hasRemoteDocument(document)) {
      document.setDocument(before, "agent-bootstrap");
    }
    const beforeStateVector = Y.encodeStateVector(ydoc);

    const { document: preview, changedNodeIds } = applyAgentCommandsToDocument(
      before,
      input.commands
    );
    assertUnchangedStateVector(beforeStateVector, ydoc);
    document.setDocument(preview, "agent-command");
    await waitForFlush();
    return { before, preview, changedNodeIds };
  } finally {
    provider.destroy();
    document.destroy();
  }
}

function readRemoteDocumentOrFallback(
  document: ReturnType<typeof createCollaborativeDesignDocument>,
  fallbackDocument: DesignFile
): DesignFile {
  try {
    return document.getDocument() as DesignFile;
  } catch {
    return structuredClone(fallbackDocument);
  }
}

function hasRemoteDocument(document: ReturnType<typeof createCollaborativeDesignDocument>): boolean {
  try {
    document.getDocument();
    return true;
  } catch {
    return false;
  }
}

function waitForProviderSync(provider: WebsocketProvider, timeoutMs: number): Promise<void> {
  if (provider.synced) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for collaboration relay sync"));
    }, timeoutMs);
    const handleSync = (synced: boolean) => {
      if (synced) {
        cleanup();
        resolve();
      }
    };
    const handleError = () => {
      cleanup();
      reject(new Error("collaboration relay connection failed"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      provider.off("sync", handleSync);
      provider.off("connection-error", handleError);
    };

    provider.on("sync", handleSync);
    provider.on("connection-error", handleError);
  });
}

function waitForFlush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
}

export function assertUnchangedStateVector(beforeStateVector: Uint8Array, ydoc: Y.Doc): void {
  const applyStateVector = Y.encodeStateVector(ydoc);
  if (!buffersEqual(beforeStateVector, applyStateVector)) {
    throw new Error("collaboration document changed before agent apply; retry dryRun");
  }
}

function buffersEqual(first: Uint8Array, second: Uint8Array): boolean {
  if (first.byteLength !== second.byteLength) {
    return false;
  }
  return first.every((value, index) => value === second[index]);
}
