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
      selectedNodeId: null,
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
        selectedNodeId: "text-1",
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
        selectedNodeId: "text-1",
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
      selectedNodeId: "rectangle-1",
      selectedNodeBounds: null,
      cursor: { x: 8, y: 16, space: "document" },
      viewport: null,
      updatedAtMs: null,
      activeTool: null
    });
  });
});
