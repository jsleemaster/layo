import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyAgentCommandsToDocument,
  createAgentBatchResult,
  findNodes as findAgentNodes,
  getChangeSummary as summarizeChanges,
  inspectCanvas as inspectDesignFile,
  validateDocument as validateDesignFile,
  type AgentBatchInput,
  type AgentBatchResult,
  type AgentFindQuery,
  type AgentNodeSummary,
  type CanvasInspection,
  type ChangeSummary,
  type DocumentValidation
} from "./agent-control.js";
import {
  exportDesignToCode,
  type CodeExportOptions,
  type CodeExportResult
} from "./code-export.js";
import { applyAgentCommandsToCollaboration } from "./collaboration-agent.js";
import {
  applyConstraintsAfterParentResize,
  relayoutDesignFile
} from "./layout.js";
import { sampleDocument } from "./sample-document.js";

export interface NodeLayout {
  mode: "none" | "auto";
  direction: "horizontal" | "vertical";
  gap: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface NodeConstraints {
  horizontal: "left" | "right" | "left_right" | "center" | "scale";
  vertical: "top" | "bottom" | "top_bottom" | "center" | "scale";
}

export interface DesignNode {
  id: string;
  kind: "frame" | "rectangle" | "text" | "image" | "component" | "component_instance";
  name: string;
  component_instance?: ComponentInstance | null;
  layout?: NodeLayout | null;
  constraints?: NodeConstraints | null;
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

export interface ComponentDefinition {
  id: string;
  name: string;
  source_node: DesignNode;
  variants: Array<{ id: string; name: string; properties: Array<{ name: string; value: string }> }>;
}

export interface ComponentInstance {
  definition_id: string;
  overrides: Array<{ node_id: string; field: string; value: string }>;
  detached: boolean;
}

export interface DesignFile {
  id: string;
  name: string;
  version?: number;
  components?: ComponentDefinition[];
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

    let exists = true;
    try {
      await stat(filePath);
    } catch {
      exists = false;
    }

    if (!exists) {
      await writeFile(filePath, `${JSON.stringify(sampleDocument, null, 2)}\n`, "utf8");
      return;
    }

    await this.localizeLegacySeedFile(filePath);
  }

  private async localizeLegacySeedFile(filePath: string) {
    const raw = await readFile(filePath, "utf8");
    const document = JSON.parse(raw) as DesignFile;
    if (document.id !== sampleDocument.id) {
      return;
    }

    if (localizeLegacySampleLabels(document)) {
      await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
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

    const previousSize = { ...node.size };
    node.transform = {
      ...node.transform,
      x: patch.x ?? node.transform.x,
      y: patch.y ?? node.transform.y
    };
    node.size = {
      width: Math.max(1, patch.width ?? node.size.width),
      height: Math.max(1, patch.height ?? node.size.height)
    };
    applyConstraintsAfterParentResize(node, previousSize);
    relayoutDesignFile(document);

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
    relayoutDesignFile(document);
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
    relayoutDesignFile(document);
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
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    return node;
  }

  async listComponents(fileId: string): Promise<ComponentDefinition[]> {
    const document = await this.readFile(fileId);
    return document.components ?? [];
  }

  async createComponent(
    fileId: string,
    nodeId: string,
    input: { componentId: string; name: string }
  ): Promise<ComponentDefinition> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }

    node.kind = "component";
    node.component_instance = null;
    const component: ComponentDefinition = {
      id: input.componentId,
      name: input.name,
      source_node: structuredClone(node),
      variants: [{ id: "default", name: "Default", properties: [] }]
    };
    document.components = document.components ?? [];
    document.components.push(component);
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    return component;
  }

  async createComponentInstance(
    fileId: string,
    input: { parentId: string; definitionId: string; instanceId: string; x: number; y: number }
  ): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const parent = findParentChildren(document, input.parentId);
    if (!parent) {
      throw new Error(`parent not found: ${input.parentId}`);
    }

    const definition = (document.components ?? []).find((component) => component.id === input.definitionId);
    if (!definition) {
      throw new Error(`component not found: ${input.definitionId}`);
    }

    const node = structuredClone(definition.source_node);
    renameInstanceTree(node, input.instanceId);
    node.id = input.instanceId;
    node.name = `${definition.name} 인스턴스`;
    node.kind = "component_instance";
    node.transform = { ...node.transform, x: input.x, y: input.y };
    node.component_instance = {
      definition_id: input.definitionId,
      overrides: [],
      detached: false
    };
    parent.children.push(node);
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    return node;
  }

  async detachInstance(fileId: string, nodeId: string): Promise<DesignNode> {
    const document = await this.readFile(fileId);
    const node = findNodeById(document, nodeId);
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }
    if (!node.component_instance) {
      throw new Error(`node is not component instance: ${nodeId}`);
    }

    node.kind = "frame";
    node.component_instance = null;
    relayoutDesignFile(document);
    await this.writeFile(fileId, document);
    return node;
  }

  async inspectCanvas(fileId: string): Promise<CanvasInspection> {
    return inspectDesignFile(await this.readFile(fileId));
  }

  async findNodes(fileId: string, query: AgentFindQuery): Promise<AgentNodeSummary[]> {
    return findAgentNodes(await this.readFile(fileId), query);
  }

  async validateDocument(fileId: string): Promise<DocumentValidation> {
    return validateDesignFile(await this.readFile(fileId));
  }

  async getChangeSummary(fileId: string, before: DesignFile, after: DesignFile): Promise<ChangeSummary> {
    void fileId;
    return summarizeChanges(before, after);
  }

  async applyAgentCommands(fileId: string, input: AgentBatchInput): Promise<AgentBatchResult> {
    const before = await this.readFile(fileId);
    const persisted = !(input.dryRun ?? false);

    if (persisted && input.collaboration) {
      const collaborativeResult = await applyAgentCommandsToCollaboration({
        target: input.collaboration,
        fallbackDocument: before,
        commands: input.commands
      });
      const result = createAgentBatchResult(
        fileId,
        collaborativeResult.before,
        collaborativeResult.preview,
        input,
        true,
        collaborativeResult.changedNodeIds
      );
      await this.writeFile(fileId, collaborativeResult.preview);
      return result;
    }

    const { document: preview, changedNodeIds } = applyAgentCommandsToDocument(
      before,
      input.commands
    );
    const result = createAgentBatchResult(fileId, before, preview, input, persisted, changedNodeIds);

    if (persisted) {
      await this.writeFile(fileId, preview);
    }

    return result;
  }

  async exportCode(fileId: string, options: CodeExportOptions = {}): Promise<CodeExportResult> {
    return exportDesignToCode(await this.readFile(fileId), options);
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

function localizeLegacySampleLabels(document: DesignFile): boolean {
  let changed = false;
  if (document.name === "Sample File") {
    document.name = "샘플 파일";
    changed = true;
  }

  for (const page of document.pages) {
    if (page.name === "Page 1") {
      page.name = "페이지 1";
      changed = true;
    }
    for (const node of page.children) {
      changed = localizeLegacySampleNode(node) || changed;
    }
  }

  return changed;
}

function localizeLegacySampleNode(node: DesignNode): boolean {
  let changed = false;
  if (node.name === "Landing Frame") {
    node.name = "랜딩 프레임";
    changed = true;
  }
  if (node.name === "Headline") {
    node.name = "헤드라인";
    changed = true;
  }
  if (node.content.type === "text" && node.content.value === "Canvas MCP Editor") {
    node.content.value = "캔버스 MCP 에디터";
    changed = true;
  }

  for (const child of node.children) {
    changed = localizeLegacySampleNode(child) || changed;
  }

  return changed;
}

function findParentChildren(document: DesignFile, parentId: string): { children: DesignNode[] } | null {
  const page = document.pages.find((candidate) => candidate.id === parentId);
  if (page) {
    return page;
  }

  const node = findNodeById(document, parentId);
  return node ? { children: node.children } : null;
}

function renameInstanceTree(node: DesignNode, instanceId: string) {
  for (const child of node.children) {
    child.id = `${instanceId}__${child.id}`;
    renameInstanceTree(child, instanceId);
  }
}
