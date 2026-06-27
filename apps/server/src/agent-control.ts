import {
  applyConstraintsAfterParentResize,
  normalizeNodeConstraints,
  normalizeNodeLayout,
  normalizeNodeLayoutItem,
  relayoutDesignFile
} from "./layout.js";
import type {
  ComponentDefinition,
  DesignFile,
  DesignToken,
  DesignNode,
  NodeConstraints,
  NodeExportPreset,
  NodeLayout,
  NodeLayoutItem,
  TextWritingMode
} from "./storage";

export interface AgentNodeSummary {
  id: string;
  name: string;
  kind: DesignNode["kind"];
  path: string[];
  text?: string;
  componentDefinitionId?: string;
  layout?: NodeLayout;
  layout_item?: NodeLayoutItem;
  constraints?: NodeConstraints;
  exportPresets?: NodeExportPreset[];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface AgentFindQuery {
  id?: string;
  name?: string;
  kind?: DesignNode["kind"];
  text?: string;
  componentDefinitionId?: string;
}

export interface DocumentValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  path?: string[];
}

export interface DocumentValidation {
  ok: boolean;
  issueCount: number;
  issues: DocumentValidationIssue[];
}

export interface CanvasInspection {
  file: { id: string; name: string; version?: number };
  pages: Array<{ id: string; name: string; nodeCount: number }>;
  nodeCount: number;
  componentCount: number;
  tokens: DesignToken[];
  components: Array<{ id: string; name: string; variantCount: number }>;
  nodes: AgentNodeSummary[];
  validation: DocumentValidation;
}

export interface ChangeSummary {
  createdNodeIds: string[];
  updatedNodeIds: string[];
  removedNodeIds: string[];
  unchangedNodeCount: number;
  changedNodeIds: string[];
}

export type AgentCommand =
  | {
      type: "update_geometry";
      nodeId: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    }
  | { type: "set_fill"; nodeId: string; fill: string }
  | { type: "create_token"; token: DesignToken }
  | { type: "set_fill_token"; nodeId: string; tokenId: string }
  | { type: "set_text_typography_token"; nodeId: string; tokenId: string }
  | {
      type: "set_layout_spacing_token";
      nodeId: string;
      target: "all_gaps" | "all_padding";
      tokenId: string;
    }
  | { type: "update_text"; nodeId: string; value: string }
  | { type: "set_text_writing_mode"; nodeId: string; writingMode: TextWritingMode }
  | {
      type: "create_rectangle";
      parentId: string;
      id: string;
      name?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      fill?: string;
    }
  | {
      type: "create_text";
      parentId: string;
      id: string;
      name?: string;
      value?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      fill?: string;
      fontSize?: number;
      fontFamily?: string;
      writingMode?: TextWritingMode;
    }
  | { type: "create_component"; nodeId: string; componentId: string; name: string }
  | { type: "set_export_presets"; nodeId: string; presets: NodeExportPreset[] }
  | { type: "set_layout"; nodeId: string; layout: NodeLayout }
  | { type: "set_layout_item"; nodeId: string; layoutItem: NodeLayoutItem }
  | { type: "set_constraints"; nodeId: string; constraints: NodeConstraints }
  | {
      type: "create_component_instance";
      parentId: string;
      definitionId: string;
      instanceId: string;
      x?: number;
      y?: number;
    }
  | { type: "detach_instance"; nodeId: string };

export interface AgentBatchInput {
  dryRun?: boolean;
  collaboration?: AgentCollaborationTarget;
  commands: AgentCommand[];
}

export interface AgentCollaborationTarget {
  teamId: string;
  documentId: string;
  relayUrl: string;
  token?: string;
  userId?: string;
  memberToken?: string;
}

export interface AgentBatchAudit {
  fileId: string;
  dryRun: boolean;
  commandCount: number;
  commandTypes: string[];
  beforeIssueCount: number;
  afterIssueCount: number;
  changedNodeIds: string[];
  timestamp: string;
}

export interface AgentBatchResult {
  fileId: string;
  persisted: boolean;
  preview: DesignFile;
  validation: DocumentValidation;
  changeSummary: ChangeSummary;
  audit: AgentBatchAudit;
}

const TEXT_WRITING_MODES = new Set<TextWritingMode>(["horizontal_tb", "vertical_rl", "vertical_lr"]);

function normalizeTextWritingMode(value: TextWritingMode | undefined): TextWritingMode {
  return value && TEXT_WRITING_MODES.has(value) ? value : "horizontal_tb";
}

export function inspectCanvas(document: DesignFile): CanvasInspection {
  const nodes = summarizeNodes(document);
  const components = document.components ?? [];

  return {
    file: {
      id: document.id,
      name: document.name,
      version: document.version
    },
    pages: document.pages.map((page) => ({
      id: page.id,
      name: page.name,
      nodeCount: countNodes(page.children)
    })),
    nodeCount: nodes.length,
    componentCount: components.length,
    tokens: document.tokens ?? [],
    components: components.map((component) => ({
      id: component.id,
      name: component.name,
      variantCount: component.variants.length
    })),
    nodes,
    validation: validateDocument(document)
  };
}

export function findNodes(document: DesignFile, query: AgentFindQuery): AgentNodeSummary[] {
  const id = query.id?.toLowerCase();
  const name = query.name?.toLowerCase();
  const text = query.text?.toLowerCase();
  const componentDefinitionId = query.componentDefinitionId?.toLowerCase();

  return summarizeNodes(document).filter((node) => {
    if (id && !node.id.toLowerCase().includes(id)) {
      return false;
    }
    if (name && !node.name.toLowerCase().includes(name)) {
      return false;
    }
    if (query.kind && node.kind !== query.kind) {
      return false;
    }
    if (text && !(node.text ?? "").toLowerCase().includes(text)) {
      return false;
    }
    if (
      componentDefinitionId &&
      (node.componentDefinitionId ?? "").toLowerCase() !== componentDefinitionId
    ) {
      return false;
    }
    return true;
  });
}

export function validateDocument(document: DesignFile): DocumentValidation {
  const issues: DocumentValidationIssue[] = [];
  const ids = new Map<string, string[][]>();
  const componentIds = new Set<string>();
  const tokenTypes = new Map<string, DesignToken["type"]>();

  for (const token of document.tokens ?? []) {
    if (tokenTypes.has(token.id)) {
      issues.push({
        code: "duplicate_token_id",
        message: `duplicate token id: ${token.id}`
      });
    }
    tokenTypes.set(token.id, token.type);
    if (token.type !== "color" && token.type !== "spacing" && token.type !== "typography") {
      issues.push({
        code: "invalid_token_type",
        message: `unsupported token type: ${token.id}`
      });
    }
    if (token.type === "typography") {
      try {
        parseTypographyTokenValue(token);
      } catch {
        issues.push({
          code: "invalid_typography_token_value",
          message: `typography token value is invalid: ${token.id}`
        });
      }
    }
    if (!token.value.trim()) {
      issues.push({
        code: "invalid_token_value",
        message: `token must have a non-empty value: ${token.id}`
      });
    }
  }

  for (const component of document.components ?? []) {
    if (componentIds.has(component.id)) {
      issues.push({
        code: "duplicate_component_id",
        message: `duplicate component id: ${component.id}`
      });
    }
    componentIds.add(component.id);
    if (!component.source_node?.id) {
      issues.push({
        code: "missing_component_source",
        message: `component is missing source node: ${component.id}`
      });
    }
  }

  for (const page of document.pages) {
    registerId(ids, page.id, [page.id]);
    for (const node of page.children) {
      validateNode(node, [page.id, node.id], ids, componentIds, tokenTypes, issues);
    }
  }

  for (const [id, paths] of ids.entries()) {
    if (paths.length > 1) {
      issues.push({
        code: "duplicate_id",
        message: `duplicate id: ${id}`,
        path: paths[0]
      });
    }
  }

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    issues
  };
}

export function getChangeSummary(before: DesignFile, after: DesignFile): ChangeSummary {
  const beforeNodes = flattenNodeMap(before);
  const afterNodes = flattenNodeMap(after);
  const createdNodeIds: string[] = [];
  const updatedNodeIds: string[] = [];
  const removedNodeIds: string[] = [];
  let unchangedNodeCount = 0;

  for (const [id, afterNode] of afterNodes.entries()) {
    const beforeNode = beforeNodes.get(id);
    if (!beforeNode) {
      createdNodeIds.push(id);
    } else if (JSON.stringify(beforeNode) !== JSON.stringify(afterNode)) {
      updatedNodeIds.push(id);
    } else {
      unchangedNodeCount += 1;
    }
  }

  for (const id of beforeNodes.keys()) {
    if (!afterNodes.has(id)) {
      removedNodeIds.push(id);
    }
  }

  return {
    createdNodeIds,
    updatedNodeIds,
    removedNodeIds,
    unchangedNodeCount,
    changedNodeIds: [...createdNodeIds, ...updatedNodeIds, ...removedNodeIds]
  };
}

export function applyAgentCommandsToDocument(
  document: DesignFile,
  commands: AgentCommand[]
): { document: DesignFile; changedNodeIds: string[] } {
  const draft = structuredClone(document);
  const changedNodeIds: string[] = [];

  for (const command of commands) {
    changedNodeIds.push(applyAgentCommand(draft, command));
    relayoutDesignFile(draft);
  }

  return {
    document: draft,
    changedNodeIds: [...new Set(changedNodeIds)]
  };
}

export function createAgentBatchResult(
  fileId: string,
  before: DesignFile,
  preview: DesignFile,
  input: AgentBatchInput,
  persisted: boolean,
  changedNodeIds: string[]
): AgentBatchResult {
  const beforeValidation = validateDocument(before);
  const validation = validateDocument(preview);
  const changeSummary = getChangeSummary(before, preview);

  return {
    fileId,
    persisted,
    preview,
    validation,
    changeSummary,
    audit: {
      fileId,
      dryRun: input.dryRun ?? false,
      commandCount: input.commands.length,
      commandTypes: input.commands.map((command) => command.type),
      beforeIssueCount: beforeValidation.issueCount,
      afterIssueCount: validation.issueCount,
      changedNodeIds,
      timestamp: new Date().toISOString()
    }
  };
}

function summarizeNodes(document: DesignFile): AgentNodeSummary[] {
  const nodes: AgentNodeSummary[] = [];

  for (const page of document.pages) {
    for (const node of page.children) {
      collectSummary(node, [page.id, node.id], nodes);
    }
  }

  return nodes;
}

function collectSummary(node: DesignNode, path: string[], nodes: AgentNodeSummary[]) {
  nodes.push({
    id: node.id,
    name: node.name,
    kind: node.kind,
    path,
    text: node.content.type === "text" ? node.content.value : undefined,
    componentDefinitionId: node.component_instance?.definition_id,
    layout: node.layout ?? undefined,
    layout_item: node.layout_item ?? undefined,
    constraints: node.constraints ?? undefined,
    exportPresets: node.export_presets ? node.export_presets.map((preset) => ({ ...preset })) : undefined,
    bounds: {
      x: node.transform.x,
      y: node.transform.y,
      width: node.size.width,
      height: node.size.height
    }
  });

  for (const child of node.children) {
    collectSummary(child, [...path, child.id], nodes);
  }
}

function countNodes(nodes: DesignNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

function registerId(ids: Map<string, string[][]>, id: string, path: string[]) {
  ids.set(id, [...(ids.get(id) ?? []), path]);
}

function validateNode(
  node: DesignNode,
  path: string[],
  ids: Map<string, string[][]>,
  componentIds: Set<string>,
  tokenTypes: Map<string, DesignToken["type"]>,
  issues: DocumentValidationIssue[]
) {
  registerId(ids, node.id, path);

  if (node.size.width <= 0 || node.size.height <= 0) {
    issues.push({
      code: "invalid_size",
      message: `node must have positive size: ${node.id}`,
      nodeId: node.id,
      path
    });
  }

  if (node.style.opacity < 0 || node.style.opacity > 1) {
    issues.push({
      code: "invalid_opacity",
      message: `node opacity must be between 0 and 1: ${node.id}`,
      nodeId: node.id,
      path
    });
  }

  if (node.style.fill_token && !tokenTypes.has(node.style.fill_token)) {
    issues.push({
      code: "missing_fill_token",
      message: `node references missing fill token: ${node.style.fill_token}`,
      nodeId: node.id,
      path
    });
  }

  validateLayoutSpacingTokenReferences(node, path, tokenTypes, issues);
  validateTextTypographyTokenReference(node, path, tokenTypes, issues);
  validateExportPresets(node, path, issues);

  if (node.kind === "text" && node.content.type !== "text") {
    issues.push({
      code: "invalid_text_content",
      message: `text node must contain text content: ${node.id}`,
      nodeId: node.id,
      path
    });
  }

  if (node.kind === "image" && node.content.type !== "image") {
    issues.push({
      code: "invalid_image_content",
      message: `image node must contain image content: ${node.id}`,
      nodeId: node.id,
      path
    });
  }

  if (node.component_instance && !componentIds.has(node.component_instance.definition_id)) {
    issues.push({
      code: "missing_component_definition",
      message: `component instance references missing definition: ${node.component_instance.definition_id}`,
      nodeId: node.id,
      path
    });
  }

  for (const child of node.children) {
    validateNode(child, [...path, child.id], ids, componentIds, tokenTypes, issues);
  }
}

function validateLayoutSpacingTokenReferences(
  node: DesignNode,
  path: string[],
  tokenTypes: Map<string, DesignToken["type"]>,
  issues: DocumentValidationIssue[]
) {
  const spacingTokens = node.layout?.spacing_tokens;
  if (!spacingTokens) {
    return;
  }

  for (const tokenId of Object.values(spacingTokens)) {
    if (!tokenId) {
      continue;
    }
    const tokenType = tokenTypes.get(tokenId);
    if (!tokenType) {
      issues.push({
        code: "missing_layout_spacing_token",
        message: `node references missing layout spacing token: ${tokenId}`,
        nodeId: node.id,
        path
      });
    } else if (tokenType !== "spacing") {
      issues.push({
        code: "invalid_layout_spacing_token_type",
        message: `node layout spacing token is not spacing: ${tokenId}`,
        nodeId: node.id,
        path
      });
    }
  }
}

function validateTextTypographyTokenReference(
  node: DesignNode,
  path: string[],
  tokenTypes: Map<string, DesignToken["type"]>,
  issues: DocumentValidationIssue[]
) {
  const tokenId = node.content.type === "text" ? node.content.typography_token : undefined;
  if (!tokenId) {
    return;
  }
  const tokenType = tokenTypes.get(tokenId);
  if (!tokenType) {
    issues.push({
      code: "missing_text_typography_token",
      message: `node references missing typography token: ${tokenId}`,
      nodeId: node.id,
      path
    });
  } else if (tokenType !== "typography") {
    issues.push({
      code: "invalid_text_typography_token_type",
      message: `node typography token is not typography: ${tokenId}`,
      nodeId: node.id,
      path
    });
  }
}

interface TypographyTokenValue {
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
}

function parseTypographyTokenValue(token: DesignToken): TypographyTokenValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(token.value);
  } catch {
    throw new Error(`typography token value must be JSON: ${token.id}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`typography token value must be an object: ${token.id}`);
  }
  const candidate = parsed as Partial<TypographyTokenValue>;
  const fontFamily = typeof candidate.fontFamily === "string" ? candidate.fontFamily.trim() : "";
  const fontSize = Number(candidate.fontSize);
  const lineHeight = candidate.lineHeight === undefined ? undefined : Number(candidate.lineHeight);
  if (!fontFamily || !Number.isFinite(fontSize) || fontSize <= 0) {
    throw new Error(`typography token must include fontFamily and positive fontSize: ${token.id}`);
  }
  if (lineHeight !== undefined && (!Number.isFinite(lineHeight) || lineHeight <= 0)) {
    throw new Error(`typography token lineHeight must be positive: ${token.id}`);
  }
  return {
    fontFamily,
    fontSize,
    ...(lineHeight !== undefined ? { lineHeight } : {})
  };
}

function validateExportPresets(
  node: DesignNode,
  path: string[],
  issues: DocumentValidationIssue[]
) {
  if (!node.export_presets?.length) {
    return;
  }

  const ids = new Set<string>();
  for (const preset of node.export_presets) {
    if (!preset.id?.trim()) {
      issues.push({
        code: "invalid_export_preset_id",
        message: `node export preset id is required: ${node.id}`,
        nodeId: node.id,
        path
      });
    } else if (ids.has(preset.id)) {
      issues.push({
        code: "duplicate_export_preset_id",
        message: `duplicate export preset id: ${preset.id}`,
        nodeId: node.id,
        path
      });
    }
    ids.add(preset.id);

    if (!["png", "jpeg", "webp", "svg", "pdf"].includes(preset.format)) {
      issues.push({
        code: "invalid_export_preset_format",
        message: `unsupported export preset format: ${String(preset.format)}`,
        nodeId: node.id,
        path
      });
    }
    if (!Number.isFinite(preset.scale) || preset.scale <= 0) {
      issues.push({
        code: "invalid_export_preset_scale",
        message: `export preset scale must be positive: ${preset.id}`,
        nodeId: node.id,
        path
      });
    }
  }
}

type ComparableDesignNode = Omit<DesignNode, "children">;

function flattenNodeMap(document: DesignFile): Map<string, ComparableDesignNode> {
  const nodes = new Map<string, ComparableDesignNode>();

  for (const page of document.pages) {
    for (const node of page.children) {
      collectNode(node, nodes);
    }
  }

  return nodes;
}

function collectNode(node: DesignNode, nodes: Map<string, ComparableDesignNode>) {
  const { children, ...comparableNode } = node;
  void children;
  nodes.set(node.id, comparableNode);
  for (const child of node.children) {
    collectNode(child, nodes);
  }
}

function applyAgentCommand(document: DesignFile, command: AgentCommand): string {
  switch (command.type) {
    case "update_geometry": {
      const node = requireNode(document, command.nodeId);
      const previousSize = { ...node.size };
      node.transform = {
        ...node.transform,
        x: command.x ?? node.transform.x,
        y: command.y ?? node.transform.y
      };
      node.size = {
        width: Math.max(1, command.width ?? node.size.width),
        height: Math.max(1, command.height ?? node.size.height)
      };
      applyConstraintsAfterParentResize(node, previousSize);
      return node.id;
    }
    case "set_fill": {
      const node = requireNode(document, command.nodeId);
      node.style = { ...node.style, fill: command.fill, fill_token: null };
      return node.id;
    }
    case "create_token": {
      document.tokens = document.tokens ?? [];
      const existingIndex = document.tokens.findIndex((token) => token.id === command.token.id);
      const token = {
        id: command.token.id,
        name: command.token.name,
        type: command.token.type,
        value: command.token.value
      };
      if (existingIndex >= 0) {
        document.tokens[existingIndex] = token;
      } else {
        document.tokens.push(token);
      }
      return token.id;
    }
    case "set_fill_token": {
      const node = requireNode(document, command.nodeId);
      const token = requireColorToken(document, command.tokenId);
      node.style = { ...node.style, fill: token.value, fill_token: token.id };
      return node.id;
    }
    case "set_text_typography_token": {
      const node = requireNode(document, command.nodeId);
      if (node.content.type !== "text") {
        throw new Error(`node is not text: ${command.nodeId}`);
      }
      const token = requireTypographyToken(document, command.tokenId);
      const typography = parseTypographyTokenValue(token);
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize,
        typography_token: token.id
      };
      return node.id;
    }
    case "set_layout_spacing_token": {
      const node = requireNode(document, command.nodeId);
      const token = requireSpacingToken(document, command.tokenId);
      const value = spacingTokenValueToNumber(token);
      const layout = normalizeNodeLayout(node.layout ?? defaultNodeLayout());
      const spacingTokens = { ...(layout.spacing_tokens ?? {}) };

      if (command.target === "all_gaps") {
        layout.gap = value;
        layout.row_gap = value;
        layout.column_gap = value;
        spacingTokens.gap = token.id;
        spacingTokens.row_gap = token.id;
        spacingTokens.column_gap = token.id;
      } else {
        layout.padding = {
          top: value,
          right: value,
          bottom: value,
          left: value
        };
        spacingTokens.padding_top = token.id;
        spacingTokens.padding_right = token.id;
        spacingTokens.padding_bottom = token.id;
        spacingTokens.padding_left = token.id;
      }

      node.layout = normalizeNodeLayout({ ...layout, spacing_tokens: spacingTokens });
      return node.id;
    }
    case "update_text": {
      const node = requireNode(document, command.nodeId);
      if (node.content.type !== "text") {
        throw new Error(`node is not text: ${command.nodeId}`);
      }
      node.content = { ...node.content, value: command.value };
      return node.id;
    }
    case "set_text_writing_mode": {
      const node = requireNode(document, command.nodeId);
      if (node.content.type !== "text") {
        throw new Error(`node is not text: ${command.nodeId}`);
      }
      node.content = { ...node.content, writing_mode: normalizeTextWritingMode(command.writingMode) };
      return node.id;
    }
    case "create_rectangle": {
      const node: DesignNode = {
        id: command.id,
        kind: "rectangle",
        name: command.name ?? "사각형",
        transform: { x: command.x ?? 180, y: command.y ?? 140, rotation: 0 },
        size: { width: command.width ?? 160, height: command.height ?? 96 },
        style: {
          fill: command.fill ?? "#e0f2fe",
          stroke: null,
          stroke_width: 0,
          opacity: 1
        },
        content: { type: "empty" },
        children: []
      };
      requireParent(document, command.parentId).children.push(node);
      return node.id;
    }
    case "create_text": {
      const content: DesignNode["content"] = {
        type: "text",
        value: command.value ?? "새 텍스트",
        font_size: command.fontSize ?? 24,
        font_family: command.fontFamily ?? "Inter"
      };
      if (command.writingMode) {
        content.writing_mode = normalizeTextWritingMode(command.writingMode);
      }
      const node: DesignNode = {
        id: command.id,
        kind: "text",
        name: command.name ?? "텍스트",
        transform: { x: command.x ?? 220, y: command.y ?? 180, rotation: 0 },
        size: { width: command.width ?? 220, height: command.height ?? 44 },
        style: {
          fill: command.fill ?? "#111827",
          stroke: null,
          stroke_width: 0,
          opacity: 1
        },
        content,
        children: []
      };
      requireParent(document, command.parentId).children.push(node);
      return node.id;
    }
    case "create_component": {
      const node = requireNode(document, command.nodeId);
      node.kind = "component";
      node.component_instance = null;
      const component: ComponentDefinition = {
        id: command.componentId,
        name: command.name,
        source_node: structuredClone(node),
        variants: [{ id: "default", name: "Default", properties: [] }]
      };
      document.components = document.components ?? [];
      document.components.push(component);
      return node.id;
    }
    case "set_export_presets": {
      const node = requireNode(document, command.nodeId);
      const presets = normalizeNodeExportPresets(command.presets);
      if (presets.length > 0) {
        node.export_presets = presets;
      } else {
        delete node.export_presets;
      }
      return node.id;
    }
    case "set_layout": {
      const node = requireNode(document, command.nodeId);
      node.layout = normalizeNodeLayout(command.layout);
      return node.id;
    }
    case "set_layout_item": {
      const node = requireNode(document, command.nodeId);
      node.layout_item = normalizeNodeLayoutItem(command.layoutItem);
      return node.id;
    }
    case "set_constraints": {
      const node = requireNode(document, command.nodeId);
      node.constraints = normalizeNodeConstraints(command.constraints);
      return node.id;
    }
    case "create_component_instance": {
      const component = (document.components ?? []).find(
        (definition) => definition.id === command.definitionId
      );
      if (!component) {
        throw new Error(`component not found: ${command.definitionId}`);
      }

      const node = structuredClone(component.source_node);
      renameInstanceTree(node, command.instanceId);
      node.id = command.instanceId;
      node.name = `${component.name} 인스턴스`;
      node.kind = "component_instance";
      node.transform = { ...node.transform, x: command.x ?? 520, y: command.y ?? 140 };
      node.component_instance = {
        definition_id: command.definitionId,
        overrides: [],
        detached: false
      };
      requireParent(document, command.parentId).children.push(node);
      return node.id;
    }
    case "detach_instance": {
      const node = requireNode(document, command.nodeId);
      if (!node.component_instance) {
        throw new Error(`node is not component instance: ${command.nodeId}`);
      }
      node.kind = "frame";
      node.component_instance = null;
      return node.id;
    }
  }
}

function normalizeNodeExportPresets(presets: NodeExportPreset[]): NodeExportPreset[] {
  return presets.map((preset, index) => {
    const format = ["png", "jpeg", "webp", "svg", "pdf"].includes(preset.format)
      ? preset.format
      : "png";
    const scale = Number.isFinite(preset.scale) && preset.scale > 0 ? Math.max(1, Math.round(preset.scale)) : 1;
    return {
      id: preset.id.trim() || `export-preset-${index + 1}`,
      format,
      scale,
      suffix: preset.suffix.trim()
    };
  });
}

function requireColorToken(document: DesignFile, tokenId: string): DesignToken {
  const token = (document.tokens ?? []).find((candidate) => candidate.id === tokenId);
  if (!token) {
    throw new Error(`token not found: ${tokenId}`);
  }
  if (token.type !== "color") {
    throw new Error(`token is not a color token: ${tokenId}`);
  }
  return token;
}

function requireSpacingToken(document: DesignFile, tokenId: string): DesignToken {
  const token = (document.tokens ?? []).find((candidate) => candidate.id === tokenId);
  if (!token) {
    throw new Error(`token not found: ${tokenId}`);
  }
  if (token.type !== "spacing") {
    throw new Error(`token is not a spacing token: ${tokenId}`);
  }
  return token;
}

function requireTypographyToken(document: DesignFile, tokenId: string): DesignToken {
  const token = (document.tokens ?? []).find((candidate) => candidate.id === tokenId);
  if (!token) {
    throw new Error(`token not found: ${tokenId}`);
  }
  if (token.type !== "typography") {
    throw new Error(`token is not a typography token: ${tokenId}`);
  }
  return token;
}

function spacingTokenValueToNumber(token: DesignToken): number {
  const match = token.value.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  if (!match) {
    throw new Error(`spacing token value must be a non-negative px number: ${token.id}`);
  }
  return Number(match[1]);
}

function defaultNodeLayout(): NodeLayout {
  return {
    mode: "auto",
    direction: "vertical",
    align_items: "start",
    justify_content: "start",
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

function requireNode(document: DesignFile, nodeId: string): DesignNode {
  const node = findNodeById(document, nodeId);
  if (!node) {
    throw new Error(`node not found: ${nodeId}`);
  }
  return node;
}

function requireParent(document: DesignFile, parentId: string): { children: DesignNode[] } {
  const parent = findParentChildren(document, parentId);
  if (!parent) {
    throw new Error(`parent not found: ${parentId}`);
  }
  return parent;
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

function renameInstanceTree(node: DesignNode, instanceId: string) {
  for (const child of node.children) {
    child.id = `${instanceId}__${child.id}`;
    renameInstanceTree(child, instanceId);
  }
}
