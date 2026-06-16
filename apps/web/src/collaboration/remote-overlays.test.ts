import { describe, expect, test } from "vitest";
import type { CollaborationPresence } from "@canvas-mcp-editor/collaboration";
import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import {
  documentPointToViewport,
  getRemotePresence,
  getSelectedNodeBounds,
  shouldPublishCursor
} from "./remote-overlays";

function presence(input: Partial<CollaborationPresence>): CollaborationPresence {
  return {
    sessionId: input.sessionId ?? "session-1",
    userId: input.userId ?? "user-1",
    displayName: input.displayName ?? "User",
    color: input.color ?? "#2563eb",
    selectedNodeId: input.selectedNodeId ?? null,
    selectedNodeBounds: input.selectedNodeBounds ?? null,
    cursor: input.cursor ?? null,
    viewport: input.viewport ?? null,
    updatedAtMs: input.updatedAtMs ?? null,
    activeTool: input.activeTool ?? null
  };
}

function sampleDocument(): RendererDocument {
  return {
    id: "sample-file",
    name: "Sample File",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          {
            id: "frame-1",
            kind: "frame",
            name: "Frame",
            transform: { x: 120, y: 80, rotation: 0 },
            size: { width: 420, height: 280 },
            style: { fill: "#ffffff", stroke: "#d1d5db", stroke_width: 1, opacity: 1 },
            content: { type: "empty" },
            children: [
              {
                id: "text-1",
                kind: "text",
                name: "Title",
                transform: { x: 32, y: 40, rotation: 3 },
                size: { width: 260, height: 48 },
                style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
                content: { type: "text", value: "Hello", font_size: 28, font_family: "Inter" },
                children: []
              }
            ]
          }
        ]
      }
    ]
  };
}

describe("remote collaboration overlays", () => {
  test("filters by session id so duplicate imported users can still see each other", () => {
    const remote = presence({
      sessionId: "session-b",
      userId: "local-user",
      displayName: "Local user"
    });

    expect(
      getRemotePresence(
        [
          presence({ sessionId: "session-a", userId: "local-user" }),
          remote
        ],
        "session-a"
      )
    ).toEqual([remote]);
  });

  test("drops stale remote overlays when awareness does not remove disconnected clients quickly", () => {
    const fresh = presence({
      sessionId: "fresh-session",
      updatedAtMs: 1_000,
      cursor: { x: 40, y: 50, space: "document" }
    });
    const stale = presence({
      sessionId: "stale-session",
      updatedAtMs: 200,
      cursor: { x: 10, y: 20, space: "document" }
    });

    expect(
      getRemotePresence([fresh, stale], "local-session", {
        nowMs: 1_200,
        staleAfterMs: 500
      })
    ).toEqual([fresh]);
  });

  test("projects document coordinates through current viewport pan and zoom", () => {
    expect(
      documentPointToViewport(
        { x: 100, y: 40, space: "document" },
        { x: 24, y: -16, scale: 1.5 }
      )
    ).toEqual({ x: 174, y: 44 });
  });

  test("derives selected node bounds in document coordinates", () => {
    expect(getSelectedNodeBounds(sampleDocument(), "text-1")).toEqual({
      x: 152,
      y: 120,
      width: 260,
      height: 48,
      rotation: 3,
      space: "document"
    });
    expect(getSelectedNodeBounds(sampleDocument(), "missing")).toBeNull();
  });

  test("throttles cursor publishing while still allowing meaningful movement", () => {
    const previous = {
      point: { x: 10, y: 10, space: "document" as const },
      publishedAtMs: 100
    };

    expect(shouldPublishCursor(previous, { x: 11, y: 11, space: "document" }, 120)).toBe(false);
    expect(shouldPublishCursor(previous, { x: 16, y: 10, space: "document" }, 120)).toBe(true);
    expect(shouldPublishCursor(previous, { x: 11, y: 11, space: "document" }, 180)).toBe(true);
  });
});
