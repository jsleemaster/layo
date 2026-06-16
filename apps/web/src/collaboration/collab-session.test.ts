import { describe, expect, test } from "vitest";
import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import { createDocumentRoomId, createTeamManifest } from "@canvas-mcp-editor/collaboration";
import {
  createCollabDocumentSession,
  type CollaborationProviderFactory
} from "./collab-session";

function sampleDocument(): RendererDocument {
  return {
    id: "sample-file",
    name: "Sample File",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: []
      }
    ]
  };
}

describe("web collaboration session", () => {
  test("runs local transactions and publishes updates", () => {
    const team = createTeamManifest({
      name: "Local Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      }
    });
    const session = createCollabDocumentSession({
      team,
      documentId: "sample-file",
      initialDocument: sampleDocument(),
      enablePersistence: false
    });
    const updates: string[] = [];
    const unsubscribe = session.subscribe((document) => updates.push(document.name));

    session.transact("rename", (document) => ({
      ...document,
      name: "Renamed File"
    }));

    expect(session.status).toBe("offline");
    expect(session.getDocument().name).toBe("Renamed File");
    expect(updates).toEqual(["Renamed File"]);

    unsubscribe();
    session.destroy();
  });

  test("creates websocket provider only for websocket teams", () => {
    const calls: Array<{ relayUrl: string; roomId: string; token?: string }> = [];
    const providerFactory: CollaborationProviderFactory = (input) => {
      calls.push({
        relayUrl: input.relayUrl,
        roomId: input.roomId,
        token: input.token
      });
      return {
        onStatus(listener) {
          listener("synced");
        },
        onPresence() {
          return () => {};
        },
        updatePresence() {},
        getPresence() {
          return [];
        },
        destroy() {}
      };
    };
    const team = createTeamManifest({
      name: "Remote Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      },
      sync: {
        mode: "websocket",
        roomPrefix: "canvas-mcp-editor",
        relayUrl: "ws://127.0.0.1:4327",
        token: "secret"
      }
    });

    const session = createCollabDocumentSession({
      team,
      documentId: "sample-file",
      initialDocument: sampleDocument(),
      enablePersistence: false,
      providerFactory
    });

    expect(calls).toEqual([
      {
        relayUrl: "ws://127.0.0.1:4327",
        roomId: createDocumentRoomId(team.teamId, "sample-file"),
        token: "secret"
      }
    ]);
    expect(session.status).toBe("synced");

    session.destroy();
  });

  test("publishes provider presence changes", () => {
    let presenceListener: (() => void) | null = null;
    const providerFactory: CollaborationProviderFactory = () => ({
      onStatus() {},
      onPresence(listener) {
        presenceListener = listener;
        return () => {
          presenceListener = null;
        };
      },
      updatePresence() {},
      getPresence() {
        return [
          {
            userId: "remote-user",
            displayName: "Remote",
            color: "#16a34a",
            selectedNodeId: "text-1",
            cursor: null,
            activeTool: "select"
          }
        ];
      },
      destroy() {}
    });
    const team = createTeamManifest({
      name: "Remote Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      },
      sync: {
        mode: "websocket",
        roomPrefix: "canvas-mcp-editor",
        relayUrl: "ws://127.0.0.1:4327"
      }
    });
    const session = createCollabDocumentSession({
      team,
      documentId: "sample-file",
      initialDocument: sampleDocument(),
      enablePersistence: false,
      providerFactory
    });
    const snapshots: string[][] = [];
    session.subscribePresence((presence) =>
      snapshots.push(presence.map((member) => member.selectedNodeId ?? "none"))
    );

    const emitPresence = presenceListener as (() => void) | null;
    if (!emitPresence) {
      throw new Error("presence listener was not registered");
    }
    emitPresence();

    expect(snapshots).toEqual([["text-1"]]);

    session.destroy();
  });

  test("updates local selected-node presence", () => {
    const team = createTeamManifest({
      name: "Presence Team",
      currentUser: {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      }
    });
    const session = createCollabDocumentSession({
      team,
      documentId: "sample-file",
      initialDocument: sampleDocument(),
      enablePersistence: false
    });

    session.updatePresence({ selectedNodeId: "text-1", activeTool: "select" });

    expect(session.getPresence()).toEqual([
      {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb",
        selectedNodeId: "text-1",
        cursor: null,
        activeTool: "select"
      }
    ]);

    session.destroy();
  });
});
