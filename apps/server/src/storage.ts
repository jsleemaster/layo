import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { sampleDocument } from "./sample-document.js";

export interface DesignNode {
  id: string;
  kind: "frame" | "rectangle" | "text" | "image";
  name: string;
  transform: { x: number; y: number; rotation: number };
  size: { width: number; height: number };
  style: {
    fill: string;
    stroke: string | null;
    stroke_width: number;
    opacity: number;
  };
  content:
    | { type: "empty" }
    | { type: "text"; value: string; font_size: number; font_family: string }
    | { type: "image"; asset_id: string };
  children: DesignNode[];
}

export interface DesignFile {
  id: string;
  name: string;
  version?: number;
  pages: Array<{ id: string; name: string; children: DesignNode[] }>;
}

export type GeometryPatch = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export interface StoredFileSummary {
  id: string;
  name: string;
  path: string;
  modifiedAt: string;
}

export class FileStorage {
  constructor(private readonly rootDir = path.join(process.cwd(), ".canvas-mcp-editor")) {}

  private get filesDir() {
    return path.join(this.rootDir, "files");
  }

  private filePathFor(fileId: string) {
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
    return path.join(this.filesDir, `${safeFileId}.json`);
  }

  async ensureSeedFile() {
    await mkdir(this.filesDir, { recursive: true });
    const filePath = this.filePathFor(sampleDocument.id);

    try {
      await stat(filePath);
    } catch {
      await writeFile(filePath, `${JSON.stringify(sampleDocument, null, 2)}\n`, "utf8");
    }
  }

  async listFiles(): Promise<StoredFileSummary[]> {
    await this.ensureSeedFile();
    const entries = await readdir(this.filesDir);
    const files = entries.filter((entry) => entry.endsWith(".json"));

    return Promise.all(
      files.map(async (entry) => {
        const filePath = path.join(this.filesDir, entry);
        const raw = await readFile(filePath, "utf8");
        const document = JSON.parse(raw) as { id: string; name: string };
        const info = await stat(filePath);

        return {
          id: document.id,
          name: document.name,
          path: filePath,
          modifiedAt: info.mtime.toISOString()
        };
      })
    );
  }

  async readFile(fileId: string): Promise<DesignFile> {
    await this.ensureSeedFile();
    const filePath = this.filePathFor(fileId);
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as DesignFile;
  }

  async writeFile(fileId: string, document: DesignFile): Promise<DesignFile> {
    await mkdir(this.filesDir, { recursive: true });
    await writeFile(this.filePathFor(fileId), `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return document;
  }

  async updateNodeGeometry(fileId: string, nodeId: string, patch: GeometryPatch): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    node.transform = {
      ...node.transform,
      x: patch.x ?? node.transform.x,
      y: patch.y ?? node.transform.y
    };
    node.size = {
      width: Math.max(1, patch.width ?? node.size.width),
      height: Math.max(1, patch.height ?? node.size.height)
    };

    await this.writeFile(fileId, document);
    return node;
  }

  async setNodeFill(fileId: string, nodeId: string, fill: string): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    node.style = { ...node.style, fill };
    await this.writeFile(fileId, document);
    return node;
  }

  async updateText(fileId: string, nodeId: string, value: string): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    if (node.content.type !== "text") {
      throw new Error(`node is not text: ${nodeId}`);
    }

    node.content = { ...node.content, value };
    await this.writeFile(fileId, document);
    return node;
  }

  async createNode(fileId: string, parentId: string, node: DesignNode): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const parent = findParentChildren(document, parentId);
    if (!parent) {
      throw new Error(`parent not found: ${parentId}`);
    }

    parent.children.push(node);
    await this.writeFile(fileId, document);
    return node;
  }
}

function findNodeById(document: DesignFile, nodeId: string): DesignNode | null {
  for (const page of document.pages) {
    for (const node of page.children) {
      const found = findInNode(node, nodeId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function findInNode(node: DesignNode, nodeId: string): DesignNode | null {
  if (node.id === nodeId) {
    return node;
  }

  for (const child of node.children) {
    const found = findInNode(child, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

function findParentChildren(document: DesignFile, parentId: string): { children: DesignNode[] } | null {
  const page = document.pages.find((candidate) => candidate.id === parentId);
  if (page) {
    return page;
  }

  const node = findNodeById(document, parentId);
  return node ? { children: node.children } : null;
}
