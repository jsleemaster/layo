import { describe, expect, test } from "vitest";
import * as Y from "yjs";
import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import { createCollaborativeDesignDocument } from "./yjs-document";

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
            id: "text-1",
            kind: "text",
            name: "Headline",
            transform: { x: 32, y: 40, rotation: 0 },
            size: { width: 260, height: 48 },
            style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
            content: {
              type: "text",
              value: "Canvas MCP Editor",
              font_size: 28,
              font_family: "Inter"
            },
            children: []
          }
        ]
      }
    ]
  };
}

describe("collaborative design document", () => {
  test("creates a Yjs document and returns the initial design file", () => {
    const document = createCollaborativeDesignDocument({ document: sampleDocument() });

    expect(document.ydoc).toBeInstanceOf(Y.Doc);
    expect(document.getDocument()).toEqual(sampleDocument());

    document.destroy();
  });

  test("applies transactions and notifies subscribers once", () => {
    const document = createCollaborativeDesignDocument({ document: sampleDocument() });
    const updates: RendererDocument[] = [];
    const unsubscribe = document.subscribe((nextDocument) => updates.push(nextDocument));

    document.transact("rename", (current) => ({
      ...current,
      name: "Renamed File"
    }));

    expect(document.getDocument().name).toBe("Renamed File");
    expect(updates.map((update) => update.name)).toEqual(["Sample File", "Renamed File"]);

    unsubscribe();
    document.destroy();
  });

  test("publishes the current document when subscribing after an earlier update", () => {
    const document = createCollaborativeDesignDocument({ document: sampleDocument() });
    const updates: RendererDocument[] = [];

    document.transact("rename", (current) => ({
      ...current,
      name: "Updated File"
    }));

    const unsubscribe = document.subscribe((nextDocument) => updates.push(nextDocument));

    expect(updates.map((update) => update.name)).toEqual(["Updated File"]);

    unsubscribe();
    document.destroy();
  });

  test("syncs two sessions through Yjs updates in memory", () => {
    const first = createCollaborativeDesignDocument({ document: sampleDocument() });
    const second = createCollaborativeDesignDocument({ document: sampleDocument() });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    first.ydoc.on("update", (update: Uint8Array) => {
      Y.applyUpdate(second.ydoc, update);
    });
    second.ydoc.on("update", (update: Uint8Array) => {
      Y.applyUpdate(first.ydoc, update);
    });

    first.transact("rename", (current) => ({
      ...current,
      name: "Synced File"
    }));

    expect(second.getDocument().name).toBe("Synced File");

    first.destroy();
    second.destroy();
  });

  test("merges concurrent edits to different fields on the same node", () => {
    const first = createCollaborativeDesignDocument({ document: sampleDocument() });
    const second = createCollaborativeDesignDocument({ document: sampleDocument() });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    first.transact("move-node", (current) => {
      const next = structuredClone(current);
      const textNode = next.pages[0]?.children[0];
      if (!textNode) {
        throw new Error("missing text node");
      }
      textNode.transform.x = 96;
      return next;
    });

    second.transact("edit-text", (current) => {
      const next = structuredClone(current);
      const textNode = next.pages[0]?.children[0];
      if (!textNode || textNode.content.type !== "text") {
        throw new Error("missing text node");
      }
      textNode.content.value = "Concurrent headline";
      return next;
    });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    const mergedFromFirst = first.getDocument().pages[0]?.children[0];
    const mergedFromSecond = second.getDocument().pages[0]?.children[0];

    expect(mergedFromFirst?.transform.x).toBe(96);
    expect(mergedFromFirst?.content).toMatchObject({ type: "text", value: "Concurrent headline" });
    expect(mergedFromSecond).toEqual(mergedFromFirst);

    first.destroy();
    second.destroy();
  });

  test("merges concurrent edits to different geometry axes on the same node", () => {
    const first = createCollaborativeDesignDocument({ document: sampleDocument() });
    const second = createCollaborativeDesignDocument({ document: sampleDocument() });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    first.transact("move-node-x", (current) => {
      const next = structuredClone(current);
      const textNode = next.pages[0]?.children[0];
      if (!textNode) {
        throw new Error("missing text node");
      }
      textNode.transform.x = 96;
      return next;
    });

    second.transact("move-node-y", (current) => {
      const next = structuredClone(current);
      const textNode = next.pages[0]?.children[0];
      if (!textNode) {
        throw new Error("missing text node");
      }
      textNode.transform.y = 72;
      return next;
    });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    const mergedFromFirst = first.getDocument().pages[0]?.children[0];
    const mergedFromSecond = second.getDocument().pages[0]?.children[0];

    expect(mergedFromFirst?.transform).toMatchObject({ x: 96, y: 72, rotation: 0 });
    expect(mergedFromSecond).toEqual(mergedFromFirst);

    first.destroy();
    second.destroy();
  });

  test("keeps seeded page identity stable when a synced collaborator adds a node", () => {
    const first = createCollaborativeDesignDocument({ document: sampleDocument() });
    const second = createCollaborativeDesignDocument({ document: sampleDocument() });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    first.transact("create-text", (current) => {
      const next = structuredClone(current);
      next.pages[0]?.children.push({
        id: "text-2",
        kind: "text",
        name: "Text 2",
        transform: { x: 80, y: 120, rotation: 0 },
        size: { width: 180, height: 40 },
        style: { fill: "#111827", stroke: null, stroke_width: 0, opacity: 1 },
        content: {
          type: "text",
          value: "Synced text",
          font_size: 20,
          font_family: "Inter"
        },
        children: []
      });
      return next;
    });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    const synced = second.getDocument();
    expect(synced.pages.map((page) => page.id)).toEqual(["page-1"]);
    expect(synced.pages[0]?.children.map((node) => node.id)).toEqual(["text-1", "text-2"]);

    first.destroy();
    second.destroy();
  });

  test("rejects invalid document payloads", () => {
    const document = createCollaborativeDesignDocument({ document: sampleDocument() });

    expect(() => document.setDocument({ name: "Missing fields" } as unknown as RendererDocument)).toThrow(
      /invalid design document/i
    );

    document.destroy();
  });
});
