import type { RendererDocument } from "@canvas-mcp-editor/renderer";
import * as Y from "yjs";

export interface CollaborativeDesignDocument {
  ydoc: Y.Doc;
  getDocument(): RendererDocument;
  setDocument(document: RendererDocument, origin?: unknown): void;
  transact(label: string, apply: (document: RendererDocument) => RendererDocument): void;
  subscribe(listener: (document: RendererDocument) => void): () => void;
  destroy(): void;
}

const DOCUMENT_MAP = "design";
const DOCUMENT_JSON = "documentJson";

export function createCollaborativeDesignDocument(input: {
  document?: RendererDocument;
  ydoc?: Y.Doc;
  origin?: unknown;
}): CollaborativeDesignDocument {
  const ydoc = input.ydoc ?? new Y.Doc();
  const root = ydoc.getMap<RendererDocument>(DOCUMENT_MAP);
  const listeners = new Set<(document: RendererDocument) => void>();

  const getDocument = () => parseDesignDocument(root.get(DOCUMENT_JSON));
  const setDocument = (document: RendererDocument, origin?: unknown) => {
    const parsed = parseDesignDocument(document);
    ydoc.transact(() => {
      root.set(DOCUMENT_JSON, structuredClone(parsed));
    }, origin);
  };

  const observer = () => {
    const nextDocument = getDocument();
    for (const listener of listeners) {
      listener(nextDocument);
    }
  };

  root.observe(observer);
  if (input.document && !root.has(DOCUMENT_JSON)) {
    setDocument(input.document, input.origin);
  }

  return {
    ydoc,
    getDocument,
    setDocument,
    transact(label, apply) {
      const nextDocument = apply(structuredClone(getDocument()));
      setDocument(nextDocument, label);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      root.unobserve(observer);
      listeners.clear();
      ydoc.destroy();
    }
  };
}

function parseDesignDocument(input: unknown): RendererDocument {
  if (!input || typeof input !== "object") {
    throw new Error("invalid design document: expected object");
  }

  const candidate = input as Partial<RendererDocument>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    !Array.isArray(candidate.pages)
  ) {
    throw new Error("invalid design document: missing id, name, or pages");
  }

  return structuredClone(candidate as RendererDocument);
}
