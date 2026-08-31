import { describe, expect, test } from "vitest";
import {
  createPresenceState,
  summarizeAwarenessStates
} from "./awareness";

describe("collaboration awareness", () => {
  test("creates local user presence defaults", () => {
    expect(
      createPresenceState({
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb"
      })
    ).toEqual({
      sessionId: "user-1",
      userId: "user-1",
      displayName: "Lee",
      color: "#2563eb",
      activePageId: null,
      selectedNodeId: null,
      editingNodeId: null,
      editingMode: null,
      selectedNodeBounds: null,
      cursor: null,
      viewport: null,
      updatedAtMs: null,
      activeTool: null
    });
  });

  test("summarizes valid remote awareness states", () => {
    const states = summarizeAwarenessStates([
      {
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb",
        activePageId: "page-2",
        selectedNodeId: "text-1",
        editingNodeId: null,
        editingMode: null,
        selectedNodeBounds: {
          x: 120,
          y: 80,
          width: 220,
          height: 44,
          rotation: 0,
          space: "document"
        },
        cursor: { x: 12, y: 24, space: "document" },
        viewport: { x: 40, y: 20, scale: 1.5 },
        updatedAtMs: 1234,
        activeTool: "select"
      },
      { userId: "", displayName: "Invalid" },
      null
    ]);

    expect(states).toEqual([
      {
        sessionId: "user-1",
        userId: "user-1",
        displayName: "Lee",
        color: "#2563eb",
        activePageId: "page-2",
        selectedNodeId: "text-1",
        editingNodeId: null,
        editingMode: null,
        selectedNodeBounds: {
          x: 120,
          y: 80,
          width: 220,
          height: 44,
          rotation: 0,
          space: "document"
        },
        cursor: { x: 12, y: 24, space: "document" },
        viewport: { x: 40, y: 20, scale: 1.5 },
        updatedAtMs: 1234,
        activeTool: "select"
      }
    ]);
  });

  test("summarizes soft editing claims for selected nodes", () => {
    const states = summarizeAwarenessStates([
      {
        sessionId: "session-a",
        userId: "user-a",
        displayName: "A",
        color: "#2563eb",
        selectedNodeId: "node-1",
        editingNodeId: "node-1",
        editingMode: "resize",
        updatedAtMs: 100
      }
    ]);

    expect(states[0]).toMatchObject({
      userId: "user-a",
      selectedNodeId: "node-1",
      editingNodeId: "node-1",
      editingMode: "resize"
    });
  });

  test("defaults legacy document-space cursor and session fields", () => {
    expect(
      createPresenceState({
        userId: "user-2",
        displayName: "Legacy",
        color: "#0f766e",
        cursor: { x: 8, y: 16 },
        selectedNodeId: "rectangle-1"
      })
    ).toEqual({
      sessionId: "user-2",
      userId: "user-2",
      displayName: "Legacy",
      color: "#0f766e",
      activePageId: null,
      selectedNodeId: "rectangle-1",
      editingNodeId: null,
      editingMode: null,
      selectedNodeBounds: null,
      cursor: { x: 8, y: 16, space: "document" },
      viewport: null,
      updatedAtMs: null,
      activeTool: null
    });
  });
});
