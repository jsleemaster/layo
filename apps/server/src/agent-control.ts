import {
  applyConstraintsAfterParentResize,
  normalizeNodeConstraints,
  normalizeNodeLayout,
  normalizeNodeLayoutItem,
  relayoutDesignFile
} from "./layout.js";
import { createActiveDesignTokenReferenceMap } from "./design-token-io.js";
import type {
  ComponentDefinition,
  ComponentVariantArea,
  DesignFile,
  DesignStyle,
  DesignToken,
  DesignTokenSet,
  DesignTokenTheme,
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
  tokenSets: DesignTokenSet[];
  tokenThemes: DesignTokenTheme[];
  styles: StyleInspection[];
  components: Array<{ id: string; name: string; variantCount: number; variantArea?: ComponentVariantArea | null }>;
  nodes: AgentNodeSummary[];
  validation: DocumentValidation;
}

export interface StyleUsage {
  nodeId: string;
  nodeName: string;
  property: "fill_style" | "typography_style";
}

export type StyleInspection = DesignStyle & {
  usageCount: number;
  usedBy: StyleUsage[];
};

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
  | { type: "set_node_style"; nodeId: string; style: DesignNode["style"] }
  | { type: "create_token"; token: DesignToken }
  | { type: "create_style"; style: DesignStyle }
  | { type: "rename_style"; styleId: string; name: string }
  | { type: "duplicate_style"; styleId: string; newStyleId: string; name: string }
  | { type: "delete_style"; styleId: string }
  | { type: "upsert_token_theme"; tokenTheme: DesignTokenTheme }
  | { type: "delete_token_theme"; tokenThemeId: string }
  | { type: "reorder_token_theme"; tokenThemeId: string; direction: "up" | "down" }
  | { type: "reorder_token_theme_set"; tokenThemeId: string; tokenSetId: string; direction: "up" | "down" }
  | { type: "set_token_set_enabled"; tokenSetId: string; enabled: boolean }
  | { type: "set_token_theme_enabled"; tokenThemeId: string; enabled: boolean }
  | { type: "set_fill_token"; nodeId: string; tokenId: string }
  | { type: "set_fill_style"; nodeId: string; styleId: string }
  | { type: "set_text_typography_token"; nodeId: string; tokenId: string }
  | { type: "set_text_typography_style"; nodeId: string; styleId: string }
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
  | {
      type: "combine_components_as_variants";
      componentId: string;
      nodeIds: string[];
      propertyName?: string;
    }
  | { type: "set_component_variant_area"; componentId: string; area: ComponentVariantArea | null }
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

type ComponentInstanceStyleOverrideField = "fill" | "stroke" | "stroke_width" | "opacity";
type ComponentInstanceGeometryOverrideField = "x" | "y" | "width" | "height";
type GeometryPatch = Partial<{ x: number; y: number; width: number; height: number }>;

const componentInstanceStyleOverrideFields: ComponentInstanceStyleOverrideField[] = [
  "fill",
  "stroke",
  "stroke_width",
  "opacity"
];
const componentInstanceGeometryOverrideFields: ComponentInstanceGeometryOverrideField[] = [
  "x",
  "y",
  "width",
  "height"
];
const nullComponentOverrideValue = "__layo_component_override_null__";

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
  inspection: CanvasInspection;
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
    tokenSets: document.token_sets ?? [],
    tokenThemes: document.token_themes ?? [],
    styles: summarizeStyles(document),
    components: components.map((component) => ({
      id: component.id,
      name: component.name,
      variantCount: component.variants.length,
      variantArea: component.variant_area ?? null
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
  const tokenSetIds = new Set<string>();
  const tokenThemeIds = new Set<string>();
  const styleTypes = new Map<string, DesignStyle["type"]>();

  for (const tokenSet of document.token_sets ?? []) {
    if (tokenSetIds.has(tokenSet.id)) {
      issues.push({
        code: "duplicate_token_set_id",
        message: `duplicate token set id: ${tokenSet.id}`
      });
    }
    tokenSetIds.add(tokenSet.id);
  }

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
    if (token.set_id && document.token_sets?.length && !tokenSetIds.has(token.set_id)) {
      issues.push({
        code: "missing_token_set",
        message: `token references missing token set: ${token.id} -> ${token.set_id}`
      });
    }
  }

  for (const theme of document.token_themes ?? []) {
    if (tokenThemeIds.has(theme.id)) {
      issues.push({
        code: "duplicate_token_theme_id",
        message: `duplicate token theme id: ${theme.id}`
      });
    }
    tokenThemeIds.add(theme.id);
    if (!theme.name.trim()) {
      issues.push({
        code: "invalid_token_theme_name",
        message: `token theme must have a non-empty name: ${theme.id}`
      });
    }
    for (const tokenSetId of theme.token_set_ids) {
      if (!tokenSetIds.has(tokenSetId)) {
        issues.push({
          code: "missing_token_theme_set",
          message: `token theme references missing token set: ${theme.id} -> ${tokenSetId}`
        });
      }
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

  for (const style of document.styles ?? []) {
    if (styleTypes.has(style.id)) {
      issues.push({
        code: "duplicate_style_id",
        message: `duplicate style id: ${style.id}`
      });
    }
    styleTypes.set(style.id, style.type);
    if (style.type !== "color" && style.type !== "typography") {
      issues.push({
        code: "invalid_style_type",
        message: `unsupported style type: ${style.id}`
      });
    }
    if (!style.name.trim()) {
      issues.push({
        code: "invalid_style_name",
        message: `style must have a non-empty name: ${style.id}`
      });
    }
    if (!style.value.trim()) {
      issues.push({
        code: "invalid_style_value",
        message: `style must have a non-empty value: ${style.id}`
      });
    }
    if (style.type === "typography") {
      try {
        parseTypographyValue(style);
      } catch {
        issues.push({
          code: "invalid_typography_style_value",
          message: `typography style value is invalid: ${style.id}`
        });
      }
    }
  }

  for (const page of document.pages) {
    registerId(ids, page.id, [page.id]);
    for (const node of page.children) {
      validateNode(node, [page.id, node.id], ids, componentIds, tokenTypes, styleTypes, issues);
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
    const changedNodeId = applyAgentCommand(draft, command);
    relayoutDesignFile(draft);
    syncComponentInstanceOverridesForAgentCommand(draft, command);
    changedNodeIds.push(changedNodeId);
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
    inspection: inspectCanvas(preview),
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

function summarizeStyles(document: DesignFile): StyleInspection[] {
  const usageByStyle = new Map<string, StyleUsage[]>();

  for (const page of document.pages) {
    for (const node of page.children) {
      collectStyleUsage(node, usageByStyle);
    }
  }

  return (document.styles ?? []).map((style) => {
    const usedBy = usageByStyle.get(style.id) ?? [];
    return {
      ...style,
      usageCount: usedBy.length,
      usedBy
    };
  });
}

function collectStyleUsage(node: DesignNode, usageByStyle: Map<string, StyleUsage[]>) {
  if (node.style.fill_style) {
    appendStyleUsage(usageByStyle, node.style.fill_style, {
      nodeId: node.id,
      nodeName: node.name,
      property: "fill_style"
    });
  }

  if (node.content.type === "text" && node.content.typography_style) {
    appendStyleUsage(usageByStyle, node.content.typography_style, {
      nodeId: node.id,
      nodeName: node.name,
      property: "typography_style"
    });
  }

  for (const child of node.children) {
    collectStyleUsage(child, usageByStyle);
  }
}

function appendStyleUsage(usageByStyle: Map<string, StyleUsage[]>, styleId: string, usage: StyleUsage) {
  usageByStyle.set(styleId, [...(usageByStyle.get(styleId) ?? []), usage]);
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
  styleTypes: Map<string, DesignStyle["type"]>,
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

  validateFillStyleReference(node, path, styleTypes, issues);
  validateLayoutSpacingTokenReferences(node, path, tokenTypes, issues);
  validateTextTypographyTokenReference(node, path, tokenTypes, issues);
  validateTextTypographyStyleReference(node, path, styleTypes, issues);
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
    validateNode(child, [...path, child.id], ids, componentIds, tokenTypes, styleTypes, issues);
  }
}

function validateFillStyleReference(
  node: DesignNode,
  path: string[],
  styleTypes: Map<string, DesignStyle["type"]>,
  issues: DocumentValidationIssue[]
) {
  const styleId = node.style.fill_style;
  if (!styleId) {
    return;
  }
  const styleType = styleTypes.get(styleId);
  if (!styleType) {
    issues.push({
      code: "missing_fill_style",
      message: `node references missing fill style: ${styleId}`,
      nodeId: node.id,
      path
    });
  } else if (styleType !== "color") {
    issues.push({
      code: "invalid_fill_style_type",
      message: `node fill style is not color: ${styleId}`,
      nodeId: node.id,
      path
    });
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

function validateTextTypographyStyleReference(
  node: DesignNode,
  path: string[],
  styleTypes: Map<string, DesignStyle["type"]>,
  issues: DocumentValidationIssue[]
) {
  const styleId = node.content.type === "text" ? node.content.typography_style : undefined;
  if (!styleId) {
    return;
  }
  const styleType = styleTypes.get(styleId);
  if (!styleType) {
    issues.push({
      code: "missing_text_typography_style",
      message: `node references missing typography style: ${styleId}`,
      nodeId: node.id,
      path
    });
  } else if (styleType !== "typography") {
    issues.push({
      code: "invalid_text_typography_style_type",
      message: `node typography style is not typography: ${styleId}`,
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

function parseTypographyValue(source: Pick<DesignToken | DesignStyle, "id" | "value">): TypographyTokenValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.value);
  } catch {
    throw new Error(`typography value must be JSON: ${source.id}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`typography value must be an object: ${source.id}`);
  }
  const candidate = parsed as Partial<TypographyTokenValue>;
  const fontFamily = typeof candidate.fontFamily === "string" ? candidate.fontFamily.trim() : "";
  const fontSize = Number(candidate.fontSize);
  const lineHeight = candidate.lineHeight === undefined ? undefined : Number(candidate.lineHeight);
  if (!fontFamily || !Number.isFinite(fontSize) || fontSize <= 0) {
    throw new Error(`typography must include fontFamily and positive fontSize: ${source.id}`);
  }
  if (lineHeight !== undefined && (!Number.isFinite(lineHeight) || lineHeight <= 0)) {
    throw new Error(`typography lineHeight must be positive: ${source.id}`);
  }
  return {
    fontFamily,
    fontSize,
    ...(lineHeight !== undefined ? { lineHeight } : {})
  };
}

function parseTypographyTokenValue(token: DesignToken): TypographyTokenValue {
  return parseTypographyValue(token);
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

function safeComponentSlug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "variant"
  );
}

function normalizeVariantPropertyName(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || "variant";
}

function componentVariantValueFromName(name: string, fallbackId: string): string {
  const segments = name
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.at(-1) || name.trim() || fallbackId;
}

function combinedComponentName(names: string[], fallback: string): string {
  const prefixes = names
    .map((name) =>
      name
        .split("/")
        .slice(0, -1)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(" / ")
    )
    .filter(Boolean);
  return prefixes.length === names.length && prefixes.every((prefix) => prefix === prefixes[0])
    ? prefixes[0]
    : fallback.trim() || "Component";
}

function isDefaultOnlyComponent(component: ComponentDefinition): boolean {
  return (
    component.variants.length === 1 &&
    component.variants[0]?.id === "default" &&
    component.variants[0]?.properties.length === 0
  );
}

function defaultComponentVariantArea(): ComponentVariantArea {
  return {
    layout: "horizontal",
    gap: 32,
    padding: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

function normalizeComponentVariantArea(area: ComponentVariantArea | null | undefined): ComponentVariantArea | null {
  if (!area) {
    return null;
  }

  return {
    layout: area.layout === "vertical" ? "vertical" : "horizontal",
    gap: Math.max(0, Number.isFinite(area.gap) ? area.gap : 0),
    padding: {
      top: Math.max(0, Number.isFinite(area.padding?.top) ? area.padding.top : 0),
      right: Math.max(0, Number.isFinite(area.padding?.right) ? area.padding.right : 0),
      bottom: Math.max(0, Number.isFinite(area.padding?.bottom) ? area.padding.bottom : 0),
      left: Math.max(0, Number.isFinite(area.padding?.left) ? area.padding.left : 0)
    }
  };
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
      node.style = { ...node.style, fill: command.fill, fill_token: null, fill_style: null };
      return node.id;
    }
    case "set_node_style": {
      const node = requireNode(document, command.nodeId);
      node.style = normalizeAgentNodeStyle(command.style);
      return node.id;
    }
    case "create_token": {
      document.tokens = document.tokens ?? [];
      const existingIndex = document.tokens.findIndex((token) => token.id === command.token.id);
      const token = {
        id: command.token.id,
        name: command.token.name,
        type: command.token.type,
        value: command.token.value,
        ...(command.token.set_id ? { set_id: command.token.set_id } : {})
      };
      if (existingIndex >= 0) {
        document.tokens[existingIndex] = token;
      } else {
        document.tokens.push(token);
      }
      return token.id;
    }
    case "create_style": {
      document.styles = document.styles ?? [];
      const existingIndex = document.styles.findIndex((style) => style.id === command.style.id);
      const style = {
        id: command.style.id,
        name: command.style.name,
        type: command.style.type,
        value: command.style.value
      };
      if (existingIndex >= 0) {
        document.styles[existingIndex] = style;
      } else {
        document.styles.push(style);
      }
      materializeStyleBindings(document);
      return style.id;
    }
    case "rename_style": {
      const style = requireStyle(document, command.styleId);
      const name = command.name.trim();
      if (!name) {
        throw new Error("style name is required");
      }
      style.name = name;
      return style.id;
    }
    case "duplicate_style": {
      const source = requireStyle(document, command.styleId);
      const newStyleId = command.newStyleId.trim();
      const name = command.name.trim();
      if (!newStyleId) {
        throw new Error("style id is required");
      }
      if (!name) {
        throw new Error("style name is required");
      }
      document.styles = document.styles ?? [];
      if (document.styles.some((style) => style.id === newStyleId)) {
        throw new Error(`style already exists: ${newStyleId}`);
      }
      document.styles.push({
        id: newStyleId,
        name,
        type: source.type,
        value: source.value
      });
      return newStyleId;
    }
    case "delete_style": {
      requireStyle(document, command.styleId);
      document.styles = (document.styles ?? []).filter((style) => style.id !== command.styleId);
      clearStyleBindings(document, command.styleId);
      return command.styleId;
    }
    case "upsert_token_theme": {
      const theme = upsertTokenTheme(document, command.tokenTheme);
      materializeTokenBindings(document);
      return theme.id;
    }
    case "delete_token_theme": {
      requireTokenTheme(document, command.tokenThemeId);
      document.token_themes = (document.token_themes ?? []).filter((theme) => theme.id !== command.tokenThemeId);
      if (!document.token_themes.length) {
        delete document.token_themes;
      }
      materializeTokenBindings(document);
      return command.tokenThemeId;
    }
    case "reorder_token_theme": {
      reorderTokenTheme(document, command.tokenThemeId, command.direction);
      materializeTokenBindings(document);
      return command.tokenThemeId;
    }
    case "reorder_token_theme_set": {
      reorderTokenThemeSet(document, command.tokenThemeId, command.tokenSetId, command.direction);
      materializeTokenBindings(document);
      return command.tokenThemeId;
    }
    case "set_token_set_enabled": {
      const tokenSet = (document.token_sets ?? []).find((candidate) => candidate.id === command.tokenSetId);
      if (!tokenSet) {
        throw new Error(`token set not found: ${command.tokenSetId}`);
      }
      tokenSet.enabled = command.enabled;
      materializeTokenBindings(document);
      return tokenSet.id;
    }
    case "set_token_theme_enabled": {
      const theme = setTokenThemeEnabled(document, command.tokenThemeId, command.enabled);
      materializeTokenBindings(document);
      return theme.id;
    }
    case "set_fill_token": {
      const node = requireNode(document, command.nodeId);
      const token = requireColorToken(document, command.tokenId);
      node.style = { ...node.style, fill: token.value, fill_token: command.tokenId, fill_style: null };
      return node.id;
    }
    case "set_fill_style": {
      const node = requireNode(document, command.nodeId);
      const style = requireColorStyle(document, command.styleId);
      node.style = { ...node.style, fill: style.value, fill_token: null, fill_style: command.styleId };
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
        typography_token: command.tokenId,
        typography_style: null
      };
      return node.id;
    }
    case "set_text_typography_style": {
      const node = requireNode(document, command.nodeId);
      if (node.content.type !== "text") {
        throw new Error(`node is not text: ${command.nodeId}`);
      }
      const style = requireTypographyStyle(document, command.styleId);
      const typography = parseTypographyValue(style);
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize,
        typography_token: null,
        typography_style: command.styleId
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
        spacingTokens.gap = command.tokenId;
        spacingTokens.row_gap = command.tokenId;
        spacingTokens.column_gap = command.tokenId;
      } else {
        layout.padding = {
          top: value,
          right: value,
          bottom: value,
          left: value
        };
        spacingTokens.padding_top = command.tokenId;
        spacingTokens.padding_right = command.tokenId;
        spacingTokens.padding_bottom = command.tokenId;
        spacingTokens.padding_left = command.tokenId;
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
    case "combine_components_as_variants": {
      const components = document.components ?? [];
      const baseComponent = components.find((component) => component.id === command.componentId);
      const selection = findSiblingSelection(document, command.nodeIds);
      if (!baseComponent || !selection || selection.nodes.length < 2) {
        throw new Error("combine requires at least two sibling main components");
      }

      const selectedComponents = selection.nodes.map((node) => {
        if (node.kind !== "component") {
          throw new Error(`node is not a main component source: ${node.id}`);
        }
        const component = components.find((candidate) => candidate.source_node.id === node.id);
        if (!component) {
          throw new Error(`component definition not found for node: ${node.id}`);
        }
        if (!isDefaultOnlyComponent(component)) {
          throw new Error(`component already has authored variants: ${component.id}`);
        }
        return { node, component };
      });

      if (!selectedComponents.some(({ component }) => component.id === command.componentId)) {
        throw new Error(`base component is not selected: ${command.componentId}`);
      }

      const propertyName = normalizeVariantPropertyName(command.propertyName);
      const baseName = combinedComponentName(selectedComponents.map(({ node }) => node.name), baseComponent.name);
      const combinedComponentIds = new Set(selectedComponents.map(({ component }) => component.id));
      const sourceNode =
        selectedComponents.find(({ component }) => component.id === command.componentId)?.node ?? baseComponent.source_node;
      const combinedComponent: ComponentDefinition = {
        ...baseComponent,
        name: baseName,
        source_node: structuredClone(sourceNode),
        variant_area: defaultComponentVariantArea(),
        variants: selectedComponents.map(({ node }) => {
          const value = componentVariantValueFromName(node.name, node.id);
          return {
            id: `variant-${safeComponentSlug(node.id)}`,
            name: value,
            properties: [{ name: propertyName, value, type: "select" }],
            source_node: structuredClone(node)
          };
        })
      };

      document.components = components.map((component) =>
        component.id === command.componentId ? combinedComponent : component
      ).filter((component) => component.id === command.componentId || !combinedComponentIds.has(component.id));
      return sourceNode.id;
    }
    case "set_component_variant_area": {
      const component = (document.components ?? []).find((candidate) => candidate.id === command.componentId);
      if (!component) {
        throw new Error(`component not found: ${command.componentId}`);
      }
      component.variant_area = normalizeComponentVariantArea(command.area);
      return component.source_node.id;
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

      const variantId = component.variants[0]?.id ?? null;
      const sourceNode = componentSourceNodeForVariant(component, variantId);
      const node = structuredClone(sourceNode);
      renameInstanceTree(node, command.instanceId);
      node.id = command.instanceId;
      node.name = `${component.name} 인스턴스`;
      node.kind = "component_instance";
      node.transform = { ...node.transform, x: command.x ?? 520, y: command.y ?? 140 };
      node.component_instance = {
        definition_id: command.definitionId,
        variant_id: variantId,
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
  const token = createActiveDesignTokenReferenceMap(
    document.tokens ?? [],
    document.token_sets ?? [],
    document.token_themes ?? []
  ).get(tokenId);
  if (!token) {
    throw new Error(`token not found: ${tokenId}`);
  }
  if (token.type !== "color") {
    throw new Error(`token is not a color token: ${tokenId}`);
  }
  return token;
}

function requireColorStyle(document: DesignFile, styleId: string): DesignStyle {
  const style = requireStyle(document, styleId);
  if (style.type !== "color") {
    throw new Error(`style is not a color style: ${styleId}`);
  }
  return style;
}

function requireSpacingToken(document: DesignFile, tokenId: string): DesignToken {
  const token = createActiveDesignTokenReferenceMap(
    document.tokens ?? [],
    document.token_sets ?? [],
    document.token_themes ?? []
  ).get(tokenId);
  if (!token) {
    throw new Error(`token not found: ${tokenId}`);
  }
  if (token.type !== "spacing") {
    throw new Error(`token is not a spacing token: ${tokenId}`);
  }
  return token;
}

function requireTypographyToken(document: DesignFile, tokenId: string): DesignToken {
  const token = createActiveDesignTokenReferenceMap(
    document.tokens ?? [],
    document.token_sets ?? [],
    document.token_themes ?? []
  ).get(tokenId);
  if (!token) {
    throw new Error(`token not found: ${tokenId}`);
  }
  if (token.type !== "typography") {
    throw new Error(`token is not a typography token: ${tokenId}`);
  }
  return token;
}

function requireTypographyStyle(document: DesignFile, styleId: string): DesignStyle {
  const style = requireStyle(document, styleId);
  if (style.type !== "typography") {
    throw new Error(`style is not a typography style: ${styleId}`);
  }
  return style;
}

function requireStyle(document: DesignFile, styleId: string): DesignStyle {
  const style = (document.styles ?? []).find((candidate) => candidate.id === styleId);
  if (!style) {
    throw new Error(`style not found: ${styleId}`);
  }
  return style;
}

function materializeStyleBindings(document: DesignFile): void {
  const styleMap = new Map((document.styles ?? []).map((style) => [style.id, style]));
  for (const page of document.pages) {
    for (const node of page.children) {
      materializeNodeStyleBindings(node, styleMap);
    }
  }
  relayoutDesignFile(document);
}

function materializeNodeStyleBindings(node: DesignNode, styleMap: Map<string, DesignStyle>): void {
  if (node.style.fill_style) {
    const style = styleMap.get(node.style.fill_style);
    if (style?.type === "color") {
      node.style = { ...node.style, fill: style.value };
    }
  }

  if (node.content.type === "text" && node.content.typography_style) {
    const style = styleMap.get(node.content.typography_style);
    if (style?.type === "typography") {
      const typography = parseTypographyValue(style);
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize
      };
    }
  }

  for (const child of node.children) {
    materializeNodeStyleBindings(child, styleMap);
  }
}

function clearStyleBindings(document: DesignFile, styleId: string): void {
  for (const page of document.pages) {
    for (const node of page.children) {
      clearNodeStyleBindings(node, styleId);
    }
  }
}

function clearNodeStyleBindings(node: DesignNode, styleId: string): void {
  if (node.style.fill_style === styleId) {
    node.style = { ...node.style, fill_style: null };
  }

  if (node.content.type === "text" && node.content.typography_style === styleId) {
    node.content = { ...node.content, typography_style: null };
  }

  for (const child of node.children) {
    clearNodeStyleBindings(child, styleId);
  }
}

function materializeTokenBindings(document: DesignFile): void {
  const tokenMap = createActiveDesignTokenReferenceMap(
    document.tokens ?? [],
    document.token_sets ?? [],
    document.token_themes ?? []
  );
  for (const page of document.pages) {
    for (const node of page.children) {
      materializeNodeTokenBindings(node, tokenMap);
    }
  }
  relayoutDesignFile(document);
}

function materializeNodeTokenBindings(node: DesignNode, tokenMap: Map<string, DesignToken>): void {
  if (node.style.fill_token) {
    const token = tokenMap.get(node.style.fill_token);
    if (token?.type === "color") {
      node.style = { ...node.style, fill: token.value };
    }
  }

  if (node.content.type === "text" && node.content.typography_token) {
    const token = tokenMap.get(node.content.typography_token);
    if (token?.type === "typography") {
      const typography = parseTypographyTokenValue(token);
      node.content = {
        ...node.content,
        font_family: typography.fontFamily,
        font_size: typography.fontSize
      };
    }
  }

  if (node.layout?.spacing_tokens) {
    const layout = normalizeNodeLayout(node.layout);
    const spacingTokens = layout.spacing_tokens;
    if (spacingTokens?.gap) {
      const token = tokenMap.get(spacingTokens.gap);
      if (token?.type === "spacing") {
        layout.gap = spacingTokenValueToNumber(token);
      }
    }
    if (spacingTokens?.row_gap) {
      const token = tokenMap.get(spacingTokens.row_gap);
      if (token?.type === "spacing") {
        layout.row_gap = spacingTokenValueToNumber(token);
      }
    }
    if (spacingTokens?.column_gap) {
      const token = tokenMap.get(spacingTokens.column_gap);
      if (token?.type === "spacing") {
        layout.column_gap = spacingTokenValueToNumber(token);
      }
    }
    const paddingTokenKeys = [
      ["padding_top", "top"],
      ["padding_right", "right"],
      ["padding_bottom", "bottom"],
      ["padding_left", "left"]
    ] as const;
    for (const [tokenKey, side] of paddingTokenKeys) {
      const tokenId = spacingTokens?.[tokenKey];
      const token = tokenId ? tokenMap.get(tokenId) : undefined;
      if (token?.type === "spacing") {
        layout.padding[side] = spacingTokenValueToNumber(token);
      }
    }
    node.layout = normalizeNodeLayout(layout);
  }

  for (const child of node.children) {
    materializeNodeTokenBindings(child, tokenMap);
  }
}

function setTokenThemeEnabled(document: DesignFile, tokenThemeId: string, enabled: boolean): DesignTokenTheme {
  const theme = requireTokenTheme(document, tokenThemeId);

  const group = theme.group?.trim();
  if (enabled && group) {
    for (const candidate of document.token_themes ?? []) {
      if (candidate.id !== theme.id && candidate.group?.trim() === group) {
        candidate.enabled = false;
      }
    }
  }

  theme.enabled = enabled;
  return theme;
}

function upsertTokenTheme(document: DesignFile, input: DesignTokenTheme): DesignTokenTheme {
  const id = input.id.trim();
  if (!id) {
    throw new Error("token theme id is required");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("token theme name is required");
  }
  const tokenSetIds = normalizeTokenThemeSetIds(document, input.token_set_ids ?? []);
  const group = input.group?.trim();
  const theme: DesignTokenTheme = {
    id,
    name,
    ...(group ? { group } : {}),
    enabled: input.enabled,
    token_set_ids: tokenSetIds
  };

  document.token_themes = document.token_themes ?? [];
  const existingIndex = document.token_themes.findIndex((candidate) => candidate.id === id);
  if (existingIndex >= 0) {
    document.token_themes[existingIndex] = theme;
  } else {
    document.token_themes.push(theme);
  }

  if (theme.enabled && theme.group?.trim()) {
    for (const candidate of document.token_themes) {
      if (candidate.id !== theme.id && candidate.group?.trim() === theme.group.trim()) {
        candidate.enabled = false;
      }
    }
  }

  return theme;
}

function reorderTokenTheme(document: DesignFile, tokenThemeId: string, direction: "up" | "down"): DesignTokenTheme {
  const theme = requireTokenTheme(document, tokenThemeId);
  const themes = document.token_themes ?? [];
  const index = themes.findIndex((candidate) => candidate.id === tokenThemeId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= themes.length) {
    return theme;
  }
  const [moved] = themes.splice(index, 1);
  themes.splice(nextIndex, 0, moved);
  return moved;
}

function reorderTokenThemeSet(
  document: DesignFile,
  tokenThemeId: string,
  tokenSetId: string,
  direction: "up" | "down"
): DesignTokenTheme {
  const theme = requireTokenTheme(document, tokenThemeId);
  const knownTokenSetIds = new Set((document.token_sets ?? []).map((tokenSet) => tokenSet.id));
  if (!knownTokenSetIds.has(tokenSetId)) {
    throw new Error(`token set not found: ${tokenSetId}`);
  }
  const index = theme.token_set_ids.indexOf(tokenSetId);
  if (index < 0) {
    throw new Error(`token theme does not include token set: ${tokenThemeId} -> ${tokenSetId}`);
  }
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= theme.token_set_ids.length) {
    return theme;
  }
  const tokenSetIds = [...theme.token_set_ids];
  const [moved] = tokenSetIds.splice(index, 1);
  tokenSetIds.splice(nextIndex, 0, moved);
  theme.token_set_ids = tokenSetIds;
  return theme;
}

function normalizeTokenThemeSetIds(document: DesignFile, tokenSetIds: string[]): string[] {
  const knownTokenSetIds = new Set((document.token_sets ?? []).map((tokenSet) => tokenSet.id));
  const normalized: string[] = [];
  for (const rawId of tokenSetIds) {
    const tokenSetId = rawId.trim();
    if (!tokenSetId || normalized.includes(tokenSetId)) {
      continue;
    }
    if (!knownTokenSetIds.has(tokenSetId)) {
      throw new Error(`token set not found: ${tokenSetId}`);
    }
    normalized.push(tokenSetId);
  }
  return normalized;
}

function requireTokenTheme(document: DesignFile, tokenThemeId: string): DesignTokenTheme {
  const theme = (document.token_themes ?? []).find((candidate) => candidate.id === tokenThemeId);
  if (!theme) {
    throw new Error(`token theme not found: ${tokenThemeId}`);
  }
  return theme;
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

function findSiblingSelection(document: DesignFile, nodeIds: string[]): { parentId: string; nodes: DesignNode[] } | null {
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  if (uniqueNodeIds.length < 2) {
    return null;
  }

  for (const page of document.pages) {
    const nodes = siblingsFromChildren(page.children, uniqueNodeIds);
    if (nodes) {
      return { parentId: page.id, nodes };
    }

    for (const node of page.children) {
      const found = siblingSelectionInTree(node, uniqueNodeIds);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function siblingSelectionInTree(
  parent: DesignNode,
  nodeIds: string[]
): { parentId: string; nodes: DesignNode[] } | null {
  const nodes = siblingsFromChildren(parent.children, nodeIds);
  if (nodes) {
    return { parentId: parent.id, nodes };
  }

  for (const child of parent.children) {
    const found = siblingSelectionInTree(child, nodeIds);
    if (found) {
      return found;
    }
  }

  return null;
}

function siblingsFromChildren(children: DesignNode[], nodeIds: string[]): DesignNode[] | null {
  const nodeIdSet = new Set(nodeIds);
  const nodes = children.filter((node) => nodeIdSet.has(node.id));
  return nodes.length === nodeIds.length ? nodes : null;
}

function renameInstanceTree(node: DesignNode, instanceId: string) {
  for (const child of node.children) {
    child.id = `${instanceId}__${child.id}`;
    renameInstanceTree(child, instanceId);
  }
}

function componentSourceNodeForVariant(
  definition: ComponentDefinition,
  variantId: string | null | undefined
): DesignNode {
  const variant = variantId ? definition.variants.find((candidate) => candidate.id === variantId) : null;
  return variant?.source_node ?? definition.source_node;
}

function normalizeAgentNodeStyle(style: DesignNode["style"]): DesignNode["style"] {
  if (!Number.isFinite(style.stroke_width) || style.stroke_width < 0) {
    throw new Error(`stroke_width must be a non-negative number`);
  }
  if (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1) {
    throw new Error(`opacity must be between 0 and 1`);
  }
  return {
    fill: style.fill,
    fill_token: style.fill_token ?? null,
    fill_style: style.fill_style ?? null,
    stroke: style.stroke ?? null,
    stroke_width: style.stroke_width,
    opacity: style.opacity
  };
}

function syncComponentInstanceOverridesForAgentCommand(document: DesignFile, command: AgentCommand): void {
  if (command.type === "set_fill") {
    syncComponentInstanceStyleOverrides(document, command.nodeId, { fill: command.fill }, ["fill"]);
  } else if (command.type === "set_node_style") {
    syncComponentInstanceStyleOverrides(document, command.nodeId, command.style);
  } else if (command.type === "update_geometry") {
    syncComponentInstanceGeometryOverrides(document, command.nodeId, {
      x: command.x,
      y: command.y,
      width: command.width,
      height: command.height
    });
  }
}

function syncComponentInstanceStyleOverrides(
  document: DesignFile,
  nodeId: string,
  style: Partial<DesignNode["style"]>,
  fields: ComponentInstanceStyleOverrideField[] = componentInstanceStyleOverrideFields
): void {
  const owner = findComponentInstanceOwner(document, nodeId);
  if (!owner?.instance.component_instance) {
    return;
  }

  const existingOverrides = owner.instance.component_instance.overrides ?? [];
  const fieldsToSync = fields.filter((field) => Object.prototype.hasOwnProperty.call(style, field));
  if (fieldsToSync.length === 0) {
    return;
  }

  const nextOverrides = existingOverrides.filter(
    (override) =>
      !(
        override.node_id === owner.sourceNodeId &&
        fieldsToSync.includes(override.field as ComponentInstanceStyleOverrideField)
      )
  );
  for (const field of fieldsToSync) {
    const sourceValue = findComponentSourceStyleValue(document, owner.instance, owner.sourceNodeId, field);
    if (sourceValue === undefined) {
      continue;
    }
    const value = style[field] as string | number | null;
    if (serializeComponentOverrideValue(value) !== serializeComponentOverrideValue(sourceValue)) {
      nextOverrides.push({
        node_id: owner.sourceNodeId,
        field,
        value: serializeComponentOverrideValue(value)
      });
    }
  }

  owner.instance.component_instance = {
    ...owner.instance.component_instance,
    overrides: nextOverrides
  };
}

function syncComponentInstanceGeometryOverrides(document: DesignFile, nodeId: string, patch: GeometryPatch): void {
  const owner = findComponentInstanceOwner(document, nodeId);
  if (!owner?.instance.component_instance) {
    return;
  }

  const node = findNodeById(document, nodeId);
  if (!node) {
    return;
  }

  const fieldsToSync = componentInstanceGeometryOverrideFields.filter((field) =>
    Object.prototype.hasOwnProperty.call(patch, field)
  );
  if (owner.instance.id === nodeId) {
    const placementFields = new Set<ComponentInstanceGeometryOverrideField>(["x", "y"]);
    const sizeFieldsOnly = fieldsToSync.filter((field) => !placementFields.has(field));
    fieldsToSync.splice(0, fieldsToSync.length, ...sizeFieldsOnly);
  }
  if (fieldsToSync.length === 0) {
    return;
  }

  const existingOverrides = owner.instance.component_instance.overrides ?? [];
  const nextOverrides = existingOverrides.filter(
    (override) =>
      !(
        override.node_id === owner.sourceNodeId &&
        fieldsToSync.includes(override.field as ComponentInstanceGeometryOverrideField)
      )
  );
  for (const field of fieldsToSync) {
    const sourceValue = findComponentSourceGeometryValue(document, owner.instance, owner.sourceNodeId, field);
    if (sourceValue === undefined) {
      continue;
    }
    const value = geometryOverrideValue(node, field);
    if (serializeComponentOverrideValue(value) !== serializeComponentOverrideValue(sourceValue)) {
      nextOverrides.push({
        node_id: owner.sourceNodeId,
        field,
        value: serializeComponentOverrideValue(value)
      });
    }
  }

  owner.instance.component_instance = {
    ...owner.instance.component_instance,
    overrides: nextOverrides
  };
}

function findComponentInstanceOwner(
  document: DesignFile,
  nodeId: string
): { instance: DesignNode; sourceNodeId: string } | null {
  for (const page of document.pages) {
    for (const node of page.children) {
      const found = findComponentInstanceOwnerInNode(document, node, nodeId, null);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function findComponentInstanceOwnerInNode(
  document: DesignFile,
  node: DesignNode,
  nodeId: string,
  currentInstance: DesignNode | null
): { instance: DesignNode; sourceNodeId: string } | null {
  const nextInstance = node.component_instance ? node : currentInstance;
  if (node.id === nodeId) {
    if (node.component_instance) {
      const sourceNodeId = componentSourceNodeForInstance(document, node)?.id ?? null;
      return sourceNodeId ? { instance: node, sourceNodeId } : null;
    }
    if (!nextInstance || nextInstance.id === nodeId) {
      return null;
    }
    const sourceNodeId = sourceNodeIdFromInstanceNodeId(nextInstance.id, nodeId);
    return sourceNodeId ? { instance: nextInstance, sourceNodeId } : null;
  }

  for (const child of node.children) {
    const found = findComponentInstanceOwnerInNode(document, child, nodeId, nextInstance);
    if (found) {
      return found;
    }
  }

  return null;
}

function sourceNodeIdFromInstanceNodeId(instanceId: string, nodeId: string): string | null {
  const prefix = `${instanceId}__`;
  if (!nodeId.startsWith(prefix)) {
    return null;
  }
  const sourceNodeId = nodeId.slice(prefix.length);
  return sourceNodeId ? sourceNodeId : null;
}

function componentSourceNodeForInstance(document: DesignFile, instance: DesignNode): DesignNode | null {
  const definitionId = instance.component_instance?.definition_id;
  const definition = (document.components ?? []).find((component) => component.id === definitionId);
  return definition ? componentSourceNodeForVariant(definition, instance.component_instance?.variant_id ?? null) : null;
}

function findComponentSourceStyleValue(
  document: DesignFile,
  instance: DesignNode,
  sourceNodeId: string,
  field: ComponentInstanceStyleOverrideField
): string | number | null | undefined {
  const sourceNode = componentSourceNodeForInstance(document, instance);
  if (!sourceNode) {
    return undefined;
  }
  const node = findInNode(sourceNode, sourceNodeId);
  return node ? node.style[field] : undefined;
}

function findComponentSourceGeometryValue(
  document: DesignFile,
  instance: DesignNode,
  sourceNodeId: string,
  field: ComponentInstanceGeometryOverrideField
): number | undefined {
  const sourceNode = componentSourceNodeForInstance(document, instance);
  if (!sourceNode) {
    return undefined;
  }
  const node = findInNode(sourceNode, sourceNodeId);
  return node ? geometryOverrideValue(node, field) : undefined;
}

function geometryOverrideValue(node: DesignNode, field: ComponentInstanceGeometryOverrideField): number {
  if (field === "x" || field === "y") {
    return node.transform[field];
  }
  return node.size[field];
}

function serializeComponentOverrideValue(value: string | number | null): string {
  return value === null ? nullComponentOverrideValue : String(value);
}
