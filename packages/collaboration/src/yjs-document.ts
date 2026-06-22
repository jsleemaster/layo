import type { RendererDocument, RendererNode } from "@canvas-mcp-editor/renderer";
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
const DOCUMENT_META = "documentMeta";
const PAGES = "pages";
const NODES = "nodes";
const COMPONENTS = "components";

type YNodeMap = Y.Map<unknown>;
interface StoredPage {
  id: string;
  name: string;
  children: string[];
}

export function createCollaborativeDesignDocument(input: {
  document?: RendererDocument;
  ydoc?: Y.Doc;
  origin?: unknown;
}): CollaborativeDesignDocument {
  const ydoc = input.ydoc ?? new Y.Doc();
  const root = ydoc.getMap<unknown>(DOCUMENT_MAP);
  const listeners = new Set<(document: RendererDocument) => void>();

  const getDocument = () => readDocumentFromYjs(ydoc);
  const setDocument = (document: RendererDocument, origin?: unknown) => {
    const parsed = parseDesignDocument(document);
    ydoc.transact(() => {
      writeDocumentToYjs(ydoc, parsed);
    }, origin);
  };

  const observer = () => {
    const nextDocument = getDocument();
    for (const listener of listeners) {
      listener(nextDocument);
    }
  };

  root.observeDeep(observer);
  if (input.document && !hasGranularDocument(ydoc) && !root.has(DOCUMENT_JSON)) {
    setDocument(input.document, input.origin);
  } else if (root.has(DOCUMENT_JSON) && !hasGranularDocument(ydoc)) {
    setDocument(parseDesignDocument(root.get(DOCUMENT_JSON)), input.origin);
  }

  return {
    ydoc,
    getDocument,
    setDocument,
    transact(label, apply) {
      const before = getDocument();
      const nextDocument = parseDesignDocument(apply(structuredClone(before)));
      ydoc.transact(() => {
        applyDocumentPatch(ydoc, before, nextDocument);
      }, label);
    },
    subscribe(listener) {
      listeners.add(listener);
      if (hasGranularDocument(ydoc) || root.has(DOCUMENT_JSON)) {
        listener(getDocument());
      }
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      root.unobserveDeep(observer);
      listeners.clear();
      ydoc.destroy();
    }
  };
}

function writeDocumentToYjs(ydoc: Y.Doc, document: RendererDocument): void {
  const root = ydoc.getMap<unknown>(DOCUMENT_MAP);
  const meta = ensureMap(root, DOCUMENT_META);
  meta.set("id", document.id);
  meta.set("name", document.name);

  const pages = ensureArray<StoredPage>(root, PAGES);
  pages.delete(0, pages.length);
  pages.insert(
    0,
    document.pages.map((page) => ({
      id: page.id,
      name: page.name,
      children: page.children.map((node) => node.id)
    }))
  );

  const nodes = ensureMap<YNodeMap>(root, NODES);
  const seenNodeIds = new Set<string>();
  for (const page of document.pages) {
    for (const node of page.children) {
      writeNode(nodes, node, seenNodeIds);
    }
  }
  for (const nodeId of Array.from(nodes.keys())) {
    if (!seenNodeIds.has(nodeId)) {
      nodes.delete(nodeId);
    }
  }

  if (document.components) {
    root.set(COMPONENTS, structuredClone(document.components));
  } else {
    root.delete(COMPONENTS);
  }
  root.delete(DOCUMENT_JSON);
}

function applyDocumentPatch(
  ydoc: Y.Doc,
  before: RendererDocument,
  next: RendererDocument
): void {
  const root = ydoc.getMap<unknown>(DOCUMENT_MAP);
  const meta = ensureMap(root, DOCUMENT_META);
  if (before.id !== next.id) {
    meta.set("id", next.id);
  }
  if (before.name !== next.name) {
    meta.set("name", next.name);
  }
  if (!deepEqual(before.components ?? null, next.components ?? null)) {
    if (next.components) {
      root.set(COMPONENTS, structuredClone(next.components));
    } else {
      root.delete(COMPONENTS);
    }
  }

  if (!samePages(before.pages, next.pages)) {
    const pages = ensureArray<StoredPage>(root, PAGES);
    pages.delete(0, pages.length);
    pages.insert(
      0,
      next.pages.map((page) => ({
        id: page.id,
        name: page.name,
        children: page.children.map((node) => node.id)
      }))
    );
  }

  const beforeNodes = indexNodes(before);
  const nextNodes = indexNodes(next);
  const nodes = ensureMap<YNodeMap>(root, NODES);
  for (const [nodeId, nextNode] of nextNodes) {
    const beforeNode = beforeNodes.get(nodeId);
    if (beforeNode) {
      patchNode(nodes, beforeNode, nextNode);
    } else {
      writeNode(nodes, nextNode);
    }
  }
  for (const nodeId of beforeNodes.keys()) {
    if (!nextNodes.has(nodeId)) {
      nodes.delete(nodeId);
    }
  }
}

function writeNode(nodes: Y.Map<YNodeMap>, node: RendererNode, seenNodeIds = new Set<string>()): void {
  seenNodeIds.add(node.id);
  const nodeMap = getOrCreateNodeMap(nodes, node.id);
  nodeMap.set("id", node.id);
  nodeMap.set("kind", node.kind);
  nodeMap.set("name", node.name);
  setOptionalValue(nodeMap, "component_instance", node.component_instance);
  setOptionalValue(nodeMap, "layout", node.layout);
  setOptionalValue(nodeMap, "constraints", node.constraints);
  writeObjectMap(nodeMap, "transform", node.transform);
  writeObjectMap(nodeMap, "size", node.size);
  writeObjectMap(nodeMap, "style", node.style);
  writeObjectMap(nodeMap, "content", node.content);
  nodeMap.set("children", node.children.map((child) => child.id));
  for (const child of node.children) {
    writeNode(nodes, child, seenNodeIds);
  }
}

function patchNode(nodes: Y.Map<YNodeMap>, before: RendererNode, next: RendererNode): void {
  const nodeMap = getOrCreateNodeMap(nodes, next.id);
  setIfChanged(nodeMap, "kind", before.kind, next.kind);
  setIfChanged(nodeMap, "name", before.name, next.name);
  setOptionalIfChanged(nodeMap, "component_instance", before.component_instance, next.component_instance);
  setOptionalIfChanged(nodeMap, "layout", before.layout, next.layout);
  setOptionalIfChanged(nodeMap, "constraints", before.constraints, next.constraints);
  patchObjectMap(nodeMap, "transform", before.transform, next.transform);
  patchObjectMap(nodeMap, "size", before.size, next.size);
  patchObjectMap(nodeMap, "style", before.style, next.style);
  patchObjectMap(nodeMap, "content", before.content, next.content);
  const beforeChildren = before.children.map((child) => child.id);
  const nextChildren = next.children.map((child) => child.id);
  setIfChanged(nodeMap, "children", beforeChildren, nextChildren);
}

function readDocumentFromYjs(ydoc: Y.Doc): RendererDocument {
  const root = ydoc.getMap<unknown>(DOCUMENT_MAP);
  if (!hasGranularDocument(ydoc)) {
    return parseDesignDocument(root.get(DOCUMENT_JSON));
  }

  const meta = root.get(DOCUMENT_META) as Y.Map<unknown>;
  const pages = root.get(PAGES) as Y.Array<StoredPage>;
  const nodes = root.get(NODES) as Y.Map<YNodeMap>;
  const document: RendererDocument = {
    id: String(meta.get("id") ?? ""),
    name: String(meta.get("name") ?? ""),
    pages: mergeStoredPages(pages.toArray(), nodes).map((page) => ({
      id: page.id,
      name: page.name,
      children: page.children.map((nodeId) => readNode(nodes, nodeId))
    }))
  };
  const components = root.get(COMPONENTS);
  if (components) {
    document.components = structuredClone(components as RendererDocument["components"]);
  }
  return parseDesignDocument(document);
}

function readNode(nodes: Y.Map<YNodeMap>, nodeId: string): RendererNode {
  const nodeMap = nodes.get(nodeId);
  if (!nodeMap) {
    throw new Error(`invalid design document: missing node ${nodeId}`);
  }
  const childIds = readStringArray(nodeMap.get("children"));
  const node: RendererNode = {
    id: String(nodeMap.get("id") ?? nodeId),
    kind: nodeMap.get("kind") as RendererNode["kind"],
    name: String(nodeMap.get("name") ?? ""),
    transform: readObjectValue<RendererNode["transform"]>(nodeMap.get("transform")),
    size: readObjectValue<RendererNode["size"]>(nodeMap.get("size")),
    style: readObjectValue<RendererNode["style"]>(nodeMap.get("style")),
    content: readObjectValue<RendererNode["content"]>(nodeMap.get("content")),
    children: childIds.map((childId) => readNode(nodes, childId))
  };
  if (nodeMap.has("component_instance")) {
    node.component_instance = structuredClone(
      nodeMap.get("component_instance") as RendererNode["component_instance"]
    );
  }
  if (nodeMap.has("layout")) {
    node.layout = structuredClone(nodeMap.get("layout") as RendererNode["layout"]);
  }
  if (nodeMap.has("constraints")) {
    node.constraints = structuredClone(nodeMap.get("constraints") as RendererNode["constraints"]);
  }
  return node;
}

function mergeStoredPages(pages: StoredPage[], nodes: Y.Map<YNodeMap>): StoredPage[] {
  const mergedPages: StoredPage[] = [];
  const pagesById = new Map<string, StoredPage>();

  for (const page of pages) {
    const existing = pagesById.get(page.id);
    if (!existing) {
      const nextPage = {
        id: page.id,
        name: page.name,
        children: page.children.filter((nodeId) => nodes.has(nodeId))
      };
      pagesById.set(page.id, nextPage);
      mergedPages.push(nextPage);
      continue;
    }

    existing.name = page.name || existing.name;
    for (const nodeId of page.children) {
      if (nodes.has(nodeId) && !existing.children.includes(nodeId)) {
        existing.children.push(nodeId);
      }
    }
  }

  return mergedPages;
}

function ensureMap<T = unknown>(parent: Y.Map<unknown>, key: string): Y.Map<T> {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) {
    return existing as Y.Map<T>;
  }
  const next = new Y.Map<T>();
  parent.set(key, next);
  return next;
}

function ensureArray<T>(parent: Y.Map<unknown>, key: string): Y.Array<T> {
  const existing = parent.get(key);
  if (existing instanceof Y.Array) {
    return existing as Y.Array<T>;
  }
  const next = new Y.Array<T>();
  parent.set(key, next);
  return next;
}

function getOrCreateNodeMap(nodes: Y.Map<YNodeMap>, nodeId: string): YNodeMap {
  const existing = nodes.get(nodeId);
  if (existing) {
    return existing;
  }
  const next = new Y.Map<unknown>();
  nodes.set(nodeId, next);
  return next;
}

function writeObjectMap<T extends Record<string, unknown>>(nodeMap: Y.Map<unknown>, key: string, value: T): void {
  const valueMap = getOrCreateObjectMap(nodeMap, key, value);
  syncObjectMap(valueMap, value);
}

function patchObjectMap<T extends Record<string, unknown>>(
  nodeMap: Y.Map<unknown>,
  key: string,
  before: T,
  next: T
): void {
  if (deepEqual(before, next)) {
    return;
  }

  const valueMap = getOrCreateObjectMap(nodeMap, key, before);
  for (const objectKey of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (!(objectKey in next)) {
      valueMap.delete(objectKey);
      continue;
    }

    const nextValue = next[objectKey];
    if (!deepEqual(before[objectKey], nextValue)) {
      valueMap.set(objectKey, structuredClone(nextValue));
    }
  }
}

function getOrCreateObjectMap<T extends Record<string, unknown>>(
  nodeMap: Y.Map<unknown>,
  key: string,
  fallback: T
): Y.Map<unknown> {
  const existing = nodeMap.get(key);
  if (existing instanceof Y.Map) {
    return existing;
  }

  const next = new Y.Map<unknown>();
  nodeMap.set(key, next);
  syncObjectMap(next, isRecord(existing) ? existing : fallback);
  return next;
}

function syncObjectMap<T extends Record<string, unknown>>(valueMap: Y.Map<unknown>, value: T): void {
  for (const key of Array.from(valueMap.keys())) {
    if (!(key in value)) {
      valueMap.delete(key);
    }
  }
  for (const [key, nextValue] of Object.entries(value)) {
    if (!deepEqual(readPlainValue(valueMap.get(key)), nextValue)) {
      valueMap.set(key, structuredClone(nextValue));
    }
  }
}

function readObjectValue<T>(input: unknown): T {
  return readPlainValue(input) as T;
}

function readPlainValue(input: unknown): unknown {
  if (input instanceof Y.Map) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      output[key] = readPlainValue(value);
    }
    return output;
  }
  if (input instanceof Y.Array) {
    return input.toArray().map(readPlainValue);
  }

  return structuredClone(input);
}

function setIfChanged<T>(nodeMap: Y.Map<unknown>, key: string, before: T, next: T): void {
  if (!deepEqual(before, next)) {
    nodeMap.set(key, structuredClone(next));
  }
}

function setOptionalValue<T>(nodeMap: Y.Map<unknown>, key: string, value: T | undefined): void {
  if (value === undefined) {
    nodeMap.delete(key);
  } else {
    nodeMap.set(key, structuredClone(value));
  }
}

function setOptionalIfChanged<T>(
  nodeMap: Y.Map<unknown>,
  key: string,
  before: T | undefined,
  next: T | undefined
): void {
  if (!deepEqual(before, next)) {
    setOptionalValue(nodeMap, key, next);
  }
}

function hasGranularDocument(ydoc: Y.Doc): boolean {
  const root = ydoc.getMap<unknown>(DOCUMENT_MAP);
  return root.get(DOCUMENT_META) instanceof Y.Map && root.get(PAGES) instanceof Y.Array;
}

function samePages(before: RendererDocument["pages"], next: RendererDocument["pages"]): boolean {
  return deepEqual(
    before.map((page) => ({
      id: page.id,
      name: page.name,
      children: page.children.map((node) => node.id)
    })),
    next.map((page) => ({
      id: page.id,
      name: page.name,
      children: page.children.map((node) => node.id)
    }))
  );
}

function indexNodes(document: RendererDocument): Map<string, RendererNode> {
  const nodes = new Map<string, RendererNode>();
  const visit = (node: RendererNode) => {
    nodes.set(node.id, node);
    node.children.forEach(visit);
  };
  document.pages.forEach((page) => page.children.forEach(visit));
  return nodes;
}

function readStringArray(input: unknown): string[] {
  return Array.isArray(input) ? input.map(String) : [];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function deepEqual(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
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
