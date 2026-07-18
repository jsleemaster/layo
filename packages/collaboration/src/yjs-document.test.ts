import { describe, expect, test } from "vitest";
import * as Y from "yjs";
import type { RendererDocument } from "@layo/renderer";
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
              value: "Layo",
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

  test("round-trips every top-level design-system field through Yjs", () => {
    const source = sampleDocument();
    const sourceNode = structuredClone(source.pages[0]!.children[0]!);
    source.tokens = [
      { id: "token-color", name: "Brand/Primary", type: "color", value: "#2563eb", set_id: "core" }
    ];
    source.token_sets = [{ id: "core", name: "Core", enabled: true }];
    source.token_themes = [
      { id: "theme-light", name: "Light", group: "Brand", enabled: true, token_set_ids: ["core"] }
    ];
    source.styles = [{ id: "style-brand", name: "Brand", type: "color", value: "#2563eb" }];
    source.components = [
      {
        id: "component-headline",
        name: "Headline",
        source_node: sourceNode,
        variants: []
      }
    ];
    source.code_mappings = [
      {
        id: "mapping-headline",
        component_id: "component-headline",
        package_name: "@layo/ui",
        import_path: "@layo/ui/headline",
        export_name: "Headline",
        import_mode: "named",
        props: [],
        variant_props: [],
        docs_url: "https://example.com/headline"
      }
    ];

    const first = createCollaborativeDesignDocument({ document: source });
    const second = createCollaborativeDesignDocument({ ydoc: new Y.Doc() });
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    expect(second.getDocument()).toEqual(source);

    second.transact("rename-design-system", (current) => ({
      ...current,
      tokens: current.tokens?.map((token) => ({ ...token, name: "Brand/Interactive" })),
      styles: current.styles?.map((style) => ({ ...style, name: "Interactive" })),
      code_mappings: current.code_mappings?.map((mapping) => ({
        ...mapping,
        export_name: "InteractiveHeadline"
      }))
    }));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    expect(first.getDocument()).toEqual(second.getDocument());

    first.destroy();
    second.destroy();
  });

  test("preserves document version metadata through Yjs updates", () => {
    const source = { ...sampleDocument(), version: 7 };
    const first = createCollaborativeDesignDocument({ document: source });
    const second = createCollaborativeDesignDocument({ ydoc: new Y.Doc() });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    expect((second.getDocument() as RendererDocument & { version?: number }).version).toBe(7);

    first.destroy();
    second.destroy();
  });

  test("merges concurrent additions to the same design-system collection", () => {
    const source = sampleDocument();
    source.tokens = [];
    const first = createCollaborativeDesignDocument({ document: source });
    const second = createCollaborativeDesignDocument({ ydoc: new Y.Doc() });
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    first.transact("add-primary-token", (current) => ({
      ...current,
      tokens: [
        ...(current.tokens ?? []),
        { id: "token-primary", name: "Brand/Primary", type: "color", value: "#2563eb" }
      ]
    }));
    second.transact("add-secondary-token", (current) => ({
      ...current,
      tokens: [
        ...(current.tokens ?? []),
        { id: "token-secondary", name: "Brand/Secondary", type: "color", value: "#16a34a" }
      ]
    }));

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    expect(first.getDocument().tokens?.map((token) => token.id).sort()).toEqual([
      "token-primary",
      "token-secondary"
    ]);
    expect(second.getDocument().tokens).toEqual(first.getDocument().tokens);

    first.destroy();
    second.destroy();
  });

  test("deduplicates the order when collaborators concurrently add the same collection id", () => {
    const source = sampleDocument();
    source.tokens = [];
    const first = createCollaborativeDesignDocument({ document: source });
    const second = createCollaborativeDesignDocument({ ydoc: new Y.Doc() });
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    for (const document of [first, second]) {
      document.transact("add-shared-token", (current) => ({
        ...current,
        tokens: [
          ...(current.tokens ?? []),
          { id: "token-primary", name: "Brand/Primary", type: "color", value: "#2563eb" }
        ]
      }));
    }

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    expect(first.getDocument().tokens?.map((token) => token.id)).toEqual(["token-primary"]);
    expect(second.getDocument().tokens?.map((token) => token.id)).toEqual(["token-primary"]);

    first.destroy();
    second.destroy();
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

  test("undoes only local transactions while preserving later remote edits", () => {
    const first = createCollaborativeDesignDocument({ document: sampleDocument() });
    const second = createCollaborativeDesignDocument({ ydoc: new Y.Doc() });
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    first.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "from-second") {
        Y.applyUpdate(second.ydoc, update, "from-first");
      }
    });
    second.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "from-first") {
        Y.applyUpdate(first.ydoc, update, "from-second");
      }
    });

    first.transact("move-local", (current) => {
      const next = structuredClone(current);
      next.pages[0]!.children[0]!.transform.x = 96;
      return next;
    });
    second.transact("edit-remote", (current) => {
      const next = structuredClone(current);
      const textNode = next.pages[0]!.children[0]!;
      if (textNode.content.type !== "text") {
        throw new Error("missing text node");
      }
      textNode.content.value = "Remote headline";
      return next;
    });

    expect(first.undo()?.pages[0]?.children[0]).toMatchObject({
      transform: { x: 32 },
      content: { type: "text", value: "Remote headline" }
    });
    expect(second.getDocument().pages[0]?.children[0]).toMatchObject({
      transform: { x: 32 },
      content: { type: "text", value: "Remote headline" }
    });

    expect(first.redo()?.pages[0]?.children[0]).toMatchObject({
      transform: { x: 96 },
      content: { type: "text", value: "Remote headline" }
    });
    expect(second.getDocument().pages[0]?.children[0]).toMatchObject({
      transform: { x: 96 },
      content: { type: "text", value: "Remote headline" }
    });

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

  test("syncs node lock and visibility metadata without clobbering concurrent edits", () => {
    const first = createCollaborativeDesignDocument({ document: sampleDocument() });
    const second = createCollaborativeDesignDocument({ document: sampleDocument() });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    first.transact("lock-node", (current) => {
      const next = structuredClone(current);
      const textNode = next.pages[0]?.children[0];
      if (!textNode) {
        throw new Error("missing text node");
      }
      textNode.locked = true;
      return next;
    });

    second.transact("hide-node", (current) => {
      const next = structuredClone(current);
      const textNode = next.pages[0]?.children[0];
      if (!textNode) {
        throw new Error("missing text node");
      }
      textNode.visible = false;
      return next;
    });

    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    const mergedFromFirst = first.getDocument().pages[0]?.children[0];
    const mergedFromSecond = second.getDocument().pages[0]?.children[0];

    expect(mergedFromFirst).toMatchObject({ locked: true, visible: false });
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

  test("syncs ordered gradient and image stroke paint ownership", () => {
    const first = createCollaborativeDesignDocument({ document: sampleDocument() });
    const second = createCollaborativeDesignDocument({ document: sampleDocument() });
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));
    Y.applyUpdate(first.ydoc, Y.encodeStateAsUpdate(second.ydoc));

    first.transact("set-stroke-paints", (current) => {
      const next = structuredClone(current);
      const node = next.pages[0]?.children[0];
      if (!node) throw new Error("missing node");
      node.style.strokes = [
        {
          id: "gradient",
          color: "#111827",
          paint: {
            type: "gradient",
            gradient: {
              type: "linear",
              stops: [
                { color: "#ef4444", opacity: 1, offset: 0 },
                { color: "#2563eb", opacity: 1, offset: 1 }
              ]
            }
          },
          opacity: 1,
          width: 4,
          position: "center",
          style: "solid",
          visible: true,
          dasharray: [],
          cap: "butt",
          join: "miter",
          start_marker: "none",
          end_marker: "none"
        },
        {
          id: "image",
          color: "#111827",
          paint: { type: "image", asset_id: "asset-border" },
          opacity: 0.8,
          width: 8,
          position: "outside",
          style: "dashed",
          visible: true,
          dasharray: [8, 4],
          cap: "round",
          join: "round",
          start_marker: "none",
          end_marker: "none"
        }
      ];
      return next;
    });
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    expect(second.getDocument().pages[0]?.children[0]?.style.strokes).toEqual(
      first.getDocument().pages[0]?.children[0]?.style.strokes
    );

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
  test("round-trips ordered fill paint ownership through Yjs updates", () => {
    const source = sampleDocument();
    source.pages[0]!.children[0]!.style.fills = [
      {
        id: "base",
        color: "#111827",
        paint: { type: "solid", color: "#111827" },
        opacity: 0.8,
        visible: true,
        blend_mode: "normal"
      },
      {
        id: "accent",
        color: "#ef4444",
        paint: {
          type: "gradient",
          gradient: {
            type: "linear",
            stops: [
              { color: "#ef4444", opacity: 1, offset: 0 },
              { color: "#2563eb", opacity: 1, offset: 1 }
            ]
          }
        },
        opacity: 1,
        visible: true,
        blend_mode: "multiply"
      }
    ];

    const first = createCollaborativeDesignDocument({ document: source });
    const second = createCollaborativeDesignDocument({ ydoc: new Y.Doc() });
    Y.applyUpdate(second.ydoc, Y.encodeStateAsUpdate(first.ydoc));

    expect(second.getDocument().pages[0]?.children[0]?.style.fills).toEqual(
      source.pages[0]?.children[0]?.style.fills
    );

    first.destroy();
    second.destroy();
  });

});
