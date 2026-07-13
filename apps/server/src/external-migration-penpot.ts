import type {
  ExternalMigrationDocumentCandidate,
  ExternalMigrationImportedAsset,
  ExternalMigrationImportResult,
  ExternalMigrationReviewOptions
} from './external-migration.js';
import type { DesignFile, DesignNode, ImageFitMode, NodeFill, NodePaintGradient, NodeStroke } from './storage.js';

type JsonRecord = Record<string, unknown>;

interface PenpotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PenpotShape {
  id: string;
  name: string;
  type: string;
  bounds: PenpotBounds;
  childIds: string[];
  json: JsonRecord;
}

interface PenpotPage {
  id: string;
  name: string;
  path: string;
  json: JsonRecord;
  shapesById: Map<string, PenpotShape>;
  rootIds: string[];
}

interface PenpotPackageAsset extends ExternalMigrationImportedAsset {
  mediaId: string;
  storageObjectId: string;
  path: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

interface PenpotPackage {
  fileId: string;
  fileName: string;
  documentCandidates: ExternalMigrationDocumentCandidate[];
  pages: PenpotPage[];
  mediaById: Map<string, PenpotPackageAsset>;
  warnings: string[];
}

interface PenpotReviewResult {
  canImport: boolean;
  documentCandidates: ExternalMigrationDocumentCandidate[];
  warnings: string[];
}

interface PenpotMappingState {
  mappedNodeCount: number;
  skippedNodeCount: number;
  warnings: string[];
  assetsById: Map<string, PenpotPackageAsset>;
  usedAssets: Map<string, PenpotPackageAsset>;
}

interface PenpotSolidFillPaint {
  color: string;
  opacity: number;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const ASSET_MEDIA_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.avif', 'image/avif']
]);
const IMPORTABLE_IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG_RAW_TAGS = new Set([
  'a',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feFlood',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feOffset',
  'filter',
  'g',
  'image',
  'line',
  'linearGradient',
  'mask',
  'metadata',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'stop',
  'style',
  'svg',
  'symbol',
  'text',
  'textPath',
  'title',
  'tspan',
  'use'
]);

export function reviewPenpotZipEntries(
  entries: Map<string, Buffer>,
  options: ExternalMigrationReviewOptions = {}
): PenpotReviewResult | null {
  const penpotPackage = readPenpotPackage(entries, options);
  if (!penpotPackage) {
    return null;
  }

  return {
    canImport: penpotPackage.pages.length > 0,
    documentCandidates: penpotPackage.documentCandidates,
    warnings: penpotPackage.warnings
  };
}

export function importPenpotZipEntries(
  entries: Map<string, Buffer>,
  options: { fileId?: string; name?: string; fileName?: string } = {}
): ExternalMigrationImportResult {
  const penpotPackage = readPenpotPackage(entries, { fileName: options.fileName, sourceHint: 'penpot' });
  if (!penpotPackage || penpotPackage.pages.length === 0) {
    throw inputValidationError('Penpot ZIP export does not contain importable pages.');
  }

  const state: PenpotMappingState = {
    mappedNodeCount: 0,
    skippedNodeCount: 0,
    warnings: [...penpotPackage.warnings],
    assetsById: penpotPackage.mediaById,
    usedAssets: new Map()
  };
  const pages = penpotPackage.pages.map((page, index) => ({
    id: penpotStorageId(page.id, `page-${index + 1}`),
    name: page.name,
    children: mapPenpotPageChildren(page, state)
  }));
  const fileName = normalizeImportName(options.name, penpotPackage.fileName);
  const file: DesignFile = {
    id: safeStorageId(options.fileId, 'penpot-import'),
    name: fileName,
    pages
  };
  applyPenpotComponentRelations(file, penpotPackage.pages, state);

  return {
    source: 'penpot',
    sourceLabel: 'Penpot',
    file,
    importedAssets: [...state.usedAssets.values()].map((asset) => ({ metadata: asset.metadata, data: asset.data })),
    mappedNodeCount: state.mappedNodeCount,
    skippedNodeCount: state.skippedNodeCount,
    warnings: state.warnings
  };
}

function readPenpotPackage(
  entries: Map<string, Buffer>,
  options: ExternalMigrationReviewOptions = {}
): PenpotPackage | null {
  const manifest = parseJsonEntry(entries, 'manifest.json');
  if (!isPenpotExportManifest(manifest)) {
    return null;
  }

  const manifestFiles = Array.isArray(manifest.files) ? manifest.files.filter(isRecord) : [];
  const fileMetadata = manifestFiles[0];
  const fileId = stringValue(fileMetadata?.id) ?? firstFileIdFromEntries(entries);
  if (!fileId) {
    return null;
  }

  const filePath = `files/${fileId}.json`;
  const fileJson = asRecord(parseJsonEntry(entries, filePath)) ?? {};
  const fileName =
    normalizeImportName(options.fileName, stringValue(fileMetadata?.name) ?? stringValue(fileJson.name) ?? 'Imported Penpot');
  const pages = readPenpotPages(entries, fileId);
  const warnings = pages.length === 0 ? ['Penpot ZIP export did not contain readable page JSON entries.'] : [];
  const mediaById = readPenpotMedia(entries, fileId, warnings);
  const totalShapeCount = pages.reduce((total, page) => total + page.shapesById.size, 0);
  const documentCandidates: ExternalMigrationDocumentCandidate[] = [
    {
      path: filePath,
      name: stringValue(fileMetadata?.name) ?? stringValue(fileJson.name) ?? fileName,
      pageCount: pages.length,
      nodeCount: totalShapeCount
    },
    ...pages.map((page) => ({
      path: page.path,
      name: page.name,
      pageCount: 1,
      nodeCount: page.shapesById.size
    }))
  ];

  return {
    fileId,
    fileName: stringValue(fileMetadata?.name) ?? stringValue(fileJson.name) ?? fileName,
    documentCandidates,
    pages,
    mediaById,
    warnings
  };
}

function readPenpotPages(entries: Map<string, Buffer>, fileId: string): PenpotPage[] {
  const pagePathPattern = new RegExp(`^files/${escapeRegExp(fileId)}/pages/([^/]+)\\.json$`);
  return [...entries.entries()]
    .map(([entryPath, data]) => ({ entryPath, data, match: entryPath.match(pagePathPattern) }))
    .filter((entry): entry is { entryPath: string; data: Buffer; match: RegExpMatchArray } => entry.match !== null)
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath))
    .flatMap(({ entryPath, data, match }) => {
      const pageJson = asRecord(parseJsonBuffer(data));
      if (!pageJson) {
        return [];
      }
      const pageId = stringValue(pageJson.id) ?? match[1];
      const shapesById = readPenpotShapes(entries, fileId, pageId, pageJson);
      return [
        {
          id: pageId,
          name: stringValue(pageJson.name) ?? `Page ${match[1]}`,
          path: entryPath,
          json: pageJson,
          shapesById,
          rootIds: rootShapeIds(pageJson, shapesById)
        }
      ];
    });
}

function readPenpotShapes(
  entries: Map<string, Buffer>,
  fileId: string,
  pageId: string,
  pageJson: JsonRecord
): Map<string, PenpotShape> {
  const shapesById = new Map<string, PenpotShape>();
  const objects = valueFor(pageJson, 'objects');
  if (isRecord(objects)) {
    for (const [fallbackId, value] of Object.entries(objects)) {
      const shape = normalizePenpotShape(value, fallbackId);
      if (shape) {
        shapesById.set(shape.id, shape);
      }
    }
  }

  const inlineShapes = valueFor(pageJson, 'shapes', 'children');
  if (Array.isArray(inlineShapes)) {
    for (const value of inlineShapes) {
      const shape = normalizePenpotShape(value);
      if (shape) {
        shapesById.set(shape.id, shape);
      }
    }
  }

  const shapePathPattern = new RegExp(`^files/${escapeRegExp(fileId)}/pages/${escapeRegExp(pageId)}/([^/]+)\\.json$`);
  const shapeEntries = [...entries.entries()]
    .map(([entryPath, data]) => ({ entryPath, data, match: entryPath.match(shapePathPattern) }))
    .filter((entry): entry is { entryPath: string; data: Buffer; match: RegExpMatchArray } => entry.match !== null)
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath));

  for (const { data, match } of shapeEntries) {
    const shape = normalizePenpotShape(parseJsonBuffer(data), match[1]);
    if (shape) {
      shapesById.set(shape.id, shape);
    }
  }

  return shapesById;
}

function normalizePenpotShape(value: unknown, fallbackId?: string): PenpotShape | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(valueFor(value, 'id')) ?? fallbackId;
  if (!id) {
    return null;
  }
  const type = normalizeShapeType(stringValue(valueFor(value, 'type', 'shapeType', 'shape-type')));
  return {
    id,
    name: stringValue(valueFor(value, 'name')) ?? type ?? id,
    type: type ?? 'unknown',
    bounds: boundsForShape(value),
    childIds: childIdsForShape(value),
    json: value
  };
}

function mapPenpotPageChildren(page: PenpotPage, state: PenpotMappingState): DesignNode[] {
  return page.rootIds.flatMap((shapeId) => {
    const shape = page.shapesById.get(shapeId);
    if (!shape) {
      state.skippedNodeCount += 1;
      state.warnings.push(`Skipped missing Penpot root shape ${shapeId}.`);
      return [];
    }
    const mapped = mapPenpotShape(shape, undefined, page.shapesById, state, new Set());
    return mapped ? [mapped] : [];
  });
}

function mapPenpotShape(
  shape: PenpotShape,
  parentBounds: PenpotBounds | undefined,
  shapesById: Map<string, PenpotShape>,
  state: PenpotMappingState,
  visiting: Set<string>
): DesignNode | null {
  if (shape.json.hidden === true || shape.json.visible === false) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped hidden Penpot shape ${shape.name}.`);
    return null;
  }

  if (visiting.has(shape.id)) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped recursive Penpot shape ${shape.name}.`);
    return null;
  }

  if (
    shape.type !== 'frame'
    && shape.type !== 'rect'
    && shape.type !== 'text'
    && shape.type !== 'image'
    && shape.type !== 'svg-raw'
    && shape.type !== 'path'
    && shape.type !== 'group'
  ) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped unsupported Penpot shape type ${shape.type} (${shape.name}).`);
    return null;
  }

  const fillImageRecord = penpotFillImageRecordForShape(shape);
  const strokeImageRecord = penpotStrokeImageRecordForShape(shape);
  const fillImageMediaId = imageMediaIdForPaintRecord(fillImageRecord, 'fillImage', 'fill-image');
  const strokeImageMediaId = imageMediaIdForPaintRecord(strokeImageRecord, 'strokeImage', 'stroke-image');
  const imageMediaId = shape.type === 'image'
    ? imageMediaIdForShape(shape, fillImageRecord, strokeImageRecord)
    : undefined;
  const imageAsset = imageMediaId ? state.assetsById.get(imageMediaId) : undefined;
  const fillImageAsset = fillImageMediaId ? state.assetsById.get(fillImageMediaId) : undefined;
  const strokeImageAsset = strokeImageMediaId ? state.assetsById.get(strokeImageMediaId) : undefined;
  const pathData = shape.type === 'path' ? pathDataForShape(shape) : undefined;
  const svgRawAsset = shape.type === 'svg-raw' ? svgRawAssetForShape(shape, shapesById) : undefined;
  if (shape.type === 'path' && !pathData) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped Penpot path shape ${shape.name} because its path content was not readable.`);
    return null;
  }
  if (shape.type === 'svg-raw' && !svgRawAsset) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped Penpot svg-raw shape ${shape.name} because its SVG content was not readable.`);
    return null;
  }

  if (shape.type === 'image' && !imageAsset) {
    state.skippedNodeCount += 1;
    state.warnings.push(`Skipped Penpot image shape ${shape.name} because its packaged asset was not found.`);
    return null;
  }

  if (shape.type !== 'image' && fillImageMediaId && !fillImageAsset) {
    state.warnings.push(`Skipped unavailable Penpot fill-image paint on ${shape.name}; the owning shape was preserved.`);
  }
  if (shape.type !== 'image' && strokeImageMediaId && !strokeImageAsset) {
    state.warnings.push(`Skipped unavailable Penpot stroke-image paint on ${shape.name}; the owning shape was preserved.`);
  }

  if (shape.type === 'frame' || shape.type === 'group') {
    if (fillImageMediaId && !fillImageAsset) {
      state.warnings.push(`Skipped Penpot frame fill-image on ${shape.name} because its packaged asset was not found.`);
    }
    if (strokeImageMediaId && !strokeImageAsset) {
      state.warnings.push(`Skipped Penpot frame stroke-image on ${shape.name} because its packaged asset was not found.`);
    }
  }

  if (isPenpotMaskedGroup(shape)) {
    state.warnings.push("Imported Penpot masked group " + shape.name + " as an unclipped Layo group; mask clipping is not preserved.");
  }

  const transform = {
    x: roundGeometry(shape.bounds.x - (parentBounds?.x ?? 0)),
    y: roundGeometry(shape.bounds.y - (parentBounds?.y ?? 0)),
    rotation: finiteNumber(valueFor(shape.json, 'rotation'), 0)
  };
  const renderedImageAsset = svgRawAsset ?? (shape.type === 'image' ? imageAsset : undefined);
  const mapsAsImage = Boolean(renderedImageAsset) && shape.type !== 'frame' && shape.type !== 'group';
  const solidFillPaint = mapsAsImage ? null : penpotSolidFillPaint(shape.json);
  const fillStack = mapsAsImage ? [] : penpotFillStack(shape.json, state.assetsById);
  const fill = mapsAsImage
    ? '#f3f4f6'
    : solidFillPaint?.color ?? penpotFillColor(shape.json) ?? defaultFillForPenpotType(shape.type);
  const strokeStack = mapsAsImage ? [] : penpotStrokeStack(shape.json, state.assetsById);
  const stroke = mapsAsImage ? null : penpotStrokeColor(shape.json);
  const imagePaintRecord = fillImageRecord ?? strokeImageRecord;
  const imagePaintOpacity = imagePaintRecord
    ? finiteNumber(valueFor(imagePaintRecord, 'fillOpacity', 'fill-opacity', 'strokeOpacity', 'stroke-opacity', 'opacity'), 1)
    : undefined;
  const opacity = finiteNumber(
    valueFor(shape.json, 'opacity'),
    mapsAsImage && imagePaintOpacity !== undefined ? imagePaintOpacity : 1
  );
  const nodeId = penpotStorageId(shape.id, `${shape.type}-${state.mappedNodeCount + 1}`);
  state.mappedNodeCount += 1;

  const mapped: DesignNode = {
    id: nodeId,
    kind: mapsAsImage ? 'image' : shape.type === 'frame' ? 'frame' : shape.type === 'group' ? 'group' : shape.type === 'text' ? 'text' : shape.type === 'path' ? 'path' : 'rectangle',
    name: shape.name,
    transform,
    size: {
      width: roundGeometry(Math.max(1, shape.bounds.width)),
      height: roundGeometry(Math.max(1, shape.bounds.height))
    },
    style: {
      fill,
      ...(fillStack.length > 0 ? { fills: fillStack } : {}),
      stroke,
      stroke_width: stroke ? penpotStrokeWidth(shape.json) : 0,
      ...(strokeStack.length > 0 ? { strokes: strokeStack } : {}),
      opacity
    },
    content: mapsAsImage && renderedImageAsset
      ? imageContentForAsset(renderedImageAsset, 'fill')
      : shape.type === 'path' && pathData
      ? {
          type: 'path',
          path_data: pathData,
          fill_rule: penpotPathFillRule(shape.json)
        }
      : shape.type === 'text'
      ? {
          type: 'text',
          value: stringValue(valueFor(shape.json, 'content', 'characters', 'text')) ?? '',
          font_size: finiteNumber(valueFor(shape.json, 'fontSize', 'font-size'), 16),
          font_family: stringValue(valueFor(shape.json, 'fontFamily', 'font-family')) ?? 'Inter'
        }
      : { type: 'empty' },
    children: []
  };

  if (renderedImageAsset && shape.type !== 'frame') {
    state.usedAssets.set(renderedImageAsset.metadata.assetId, renderedImageAsset);
  }
  for (const fillPaint of fillStack) {
    if (fillPaint.paint?.type === 'image') {
      const assetId = fillPaint.paint.asset_id;
      const asset = [...state.assetsById.values()].find(
        (candidate) => candidate.metadata.assetId === assetId
      );
      if (asset) {
        state.usedAssets.set(asset.metadata.assetId, asset);
      }
    }
  }
  if (strokeImageAsset && strokeStack.some((stroke) => stroke.paint?.type === "image")) {
    state.usedAssets.set(strokeImageAsset.metadata.assetId, strokeImageAsset);
  }

  if (shape.type === 'frame' || shape.type === 'group') {
    const nextVisiting = new Set(visiting);
    nextVisiting.add(shape.id);
    const mappedChildren = shape.childIds.flatMap((childId) => {
      const child = shapesById.get(childId);
      if (!child) {
        state.skippedNodeCount += 1;
        state.warnings.push(`Skipped missing Penpot child shape ${childId} in ${shape.name}.`);
        return [];
      }
      const mappedChild = mapPenpotShape(child, shape.bounds, shapesById, state, nextVisiting);
      return mappedChild ? [mappedChild] : [];
    });
    mapped.children = mappedChildren;
  }

  return mapped;
}

function applyPenpotComponentRelations(
  file: DesignFile,
  penpotPages: PenpotPage[],
  state: PenpotMappingState
): void {
  const mainShapesByComponentId = new Map<string, Array<{ page: PenpotPage; shape: PenpotShape }>>();
  for (const page of penpotPages) {
    for (const shape of page.shapesById.values()) {
      const componentId = stringValue(valueFor(shape.json, 'componentId', 'component-id'));
      const isMain = valueFor(shape.json, 'mainInstance', 'main-instance') === true;
      const isRoot = valueFor(shape.json, 'componentRoot', 'component-root') === true;
      if (!componentId || !isMain || !isRoot) {
        continue;
      }
      const candidates = mainShapesByComponentId.get(componentId) ?? [];
      candidates.push({ page, shape });
      mainShapesByComponentId.set(componentId, candidates);
    }
  }

  const definitionsByComponentId = new Map<string, NonNullable<DesignFile['components']>[number]>();
  const mainShapeIds = new Set<string>();
  for (const [componentId, candidates] of mainShapesByComponentId) {
    if (candidates.length !== 1) {
      state.warnings.push(
        `Preserved Penpot component ${componentId} as ordinary shapes because ${candidates.length} main instances were found.`
      );
      continue;
    }

    const { page, shape } = candidates[0];
    const mappedPage = file.pages.find((candidate) => candidate.id === penpotStorageId(page.id, page.id));
    const mappedMain = mappedPage
      ? findDesignNode(mappedPage.children, penpotStorageId(shape.id, shape.id))
      : null;
    if (!mappedMain) {
      state.warnings.push(`Preserved Penpot component ${shape.name} without ownership because its main instance was not importable.`);
      continue;
    }

    mappedMain.kind = 'component';
    mappedMain.component_instance = null;
    const definition = {
      id: `penpot-component-${storageIdSegment(componentId)}`,
      name: shape.name,
      source_node: structuredClone(mappedMain),
      variants: [{ id: 'default', name: 'Default', properties: [] }]
    } satisfies NonNullable<DesignFile['components']>[number];
    definitionsByComponentId.set(componentId, definition);
    mainShapeIds.add(shape.id);
  }

  for (const page of penpotPages) {
    const mappedPage = file.pages.find((candidate) => candidate.id === penpotStorageId(page.id, page.id));
    if (!mappedPage) {
      continue;
    }

    for (const shape of page.shapesById.values()) {
      const componentId = stringValue(valueFor(shape.json, 'componentId', 'component-id'));
      const shapeRef = stringValue(valueFor(shape.json, 'shapeRef', 'shape-ref'));
      const isRoot = valueFor(shape.json, 'componentRoot', 'component-root') === true;
      const isMain = valueFor(shape.json, 'mainInstance', 'main-instance') === true;
      if (!componentId || !shapeRef || !isRoot || isMain) {
        continue;
      }

      const definition = definitionsByComponentId.get(componentId);
      const mainCandidates = mainShapesByComponentId.get(componentId) ?? [];
      if (!definition || mainCandidates.length !== 1 || !mainShapeIds.has(shapeRef)) {
        state.warnings.push(
          `Preserved Penpot component copy ${shape.name} as an ordinary shape because its main-instance relation was missing or ambiguous.`
        );
        continue;
      }

      const mappedCopy = findDesignNode(mappedPage.children, penpotStorageId(shape.id, shape.id));
      if (!mappedCopy) {
        state.warnings.push(`Skipped Penpot component ownership for ${shape.name} because its mapped copy was not found.`);
        continue;
      }

      const instance = materializePenpotComponentInstance(definition.source_node, mappedCopy, definition.id);
      applyPenpotCopyOverrides(instance, definition.source_node, shape, page.shapesById, state);
      replaceDesignNode(mappedPage.children, mappedCopy.id, instance);
    }
  }

  if (definitionsByComponentId.size > 0) {
    file.components = [...definitionsByComponentId.values()];
  }
}

function materializePenpotComponentInstance(
  source: DesignNode,
  mappedCopy: DesignNode,
  definitionId: string
): DesignNode {
  const instance = structuredClone(source);
  const instanceId = mappedCopy.id;
  renamePenpotInstanceTree(instance, instanceId, true);
  instance.kind = 'component_instance';
  instance.name = mappedCopy.name;
  instance.transform = structuredClone(mappedCopy.transform);
  instance.size = structuredClone(mappedCopy.size);
  instance.component_instance = {
    definition_id: definitionId,
    variant_id: 'default',
    overrides: [],
    detached: false
  };
  return instance;
}

function renamePenpotInstanceTree(node: DesignNode, instanceId: string, root: boolean): void {
  node.id = root ? instanceId : `${instanceId}__${node.id}`;
  for (const child of node.children) {
    renamePenpotInstanceTree(child, instanceId, false);
  }
}

function applyPenpotCopyOverrides(
  instance: DesignNode,
  source: DesignNode,
  copyRoot: PenpotShape,
  shapesById: Map<string, PenpotShape>,
  state: PenpotMappingState
): void {
  const copyShapes = collectPenpotShapeTree(copyRoot, shapesById);
  for (const copyShape of copyShapes) {
    const sourceShapeId = stringValue(valueFor(copyShape.json, 'shapeRef', 'shape-ref'));
    if (!sourceShapeId) {
      continue;
    }
    const touched = valueFor(copyShape.json, 'touched');
    const touchedGroups = Array.isArray(touched)
      ? touched.filter((value): value is string => typeof value === 'string')
      : [];
    if (!touchedGroups.includes('text-content-group')) {
      continue;
    }

    const sourceNodeId = penpotStorageId(sourceShapeId, sourceShapeId);
    const sourceNode = findDesignNode([source], sourceNodeId);
    const instanceNode = findDesignNode([instance], `${instance.id}__${sourceNodeId}`);
    const textValue = stringValue(valueFor(copyShape.json, 'content', 'characters', 'text'));
    if (!sourceNode || sourceNode.content.type !== 'text' || !instanceNode || instanceNode.content.type !== 'text' || textValue === undefined) {
      state.warnings.push(
        `Skipped unreadable Penpot text override on ${copyShape.name}; the linked component instance was preserved.`
      );
      continue;
    }
    if (textValue === sourceNode.content.value) {
      continue;
    }

    instanceNode.content = { ...instanceNode.content, value: textValue };
    instance.component_instance?.overrides.push({
      node_id: sourceNodeId,
      field: 'text',
      value: textValue
    });
  }
}

function collectPenpotShapeTree(root: PenpotShape, shapesById: Map<string, PenpotShape>): PenpotShape[] {
  const result: PenpotShape[] = [];
  const visit = (shape: PenpotShape): void => {
    result.push(shape);
    for (const childId of shape.childIds) {
      const child = shapesById.get(childId);
      if (child) {
        visit(child);
      }
    }
  };
  visit(root);
  return result;
}

function findDesignNode(nodes: DesignNode[], nodeId: string): DesignNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const descendant = findDesignNode(node.children, nodeId);
    if (descendant) {
      return descendant;
    }
  }
  return null;
}

function replaceDesignNode(nodes: DesignNode[], nodeId: string, replacement: DesignNode): boolean {
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index].id === nodeId) {
      nodes[index] = replacement;
      return true;
    }
    if (replaceDesignNode(nodes[index].children, nodeId, replacement)) {
      return true;
    }
  }
  return false;
}

function readPenpotMedia(
  entries: Map<string, Buffer>,
  fileId: string,
  warnings: string[]
): Map<string, PenpotPackageAsset> {
  const mediaById = new Map<string, PenpotPackageAsset>();
  const mediaPathPattern = new RegExp(`^files/${escapeRegExp(fileId)}/media/([^/]+)\\.json$`);
  const mediaEntries = [...entries.entries()]
    .map(([entryPath, data]) => ({ entryPath, data, match: entryPath.match(mediaPathPattern) }))
    .filter((entry): entry is { entryPath: string; data: Buffer; match: RegExpMatchArray } => entry.match !== null)
    .sort((left, right) => left.entryPath.localeCompare(right.entryPath));

  for (const { data, entryPath, match } of mediaEntries) {
    const media = asRecord(parseJsonBuffer(data));
    if (!media) {
      warnings.push(`Skipped unreadable Penpot media metadata ${entryPath}.`);
      continue;
    }
    const mediaId = stringValue(valueFor(media, 'id')) ?? match[1];
    const storageObjectId = stringValue(valueFor(media, 'mediaId', 'media-id', 'objectId', 'object-id'));
    const mediaType = stringValue(valueFor(media, 'mtype', 'mimeType', 'mime-type', 'contentType', 'content-type'));
    if (!mediaId || !storageObjectId || !mediaType || !IMPORTABLE_IMAGE_MEDIA_TYPES.has(mediaType)) {
      warnings.push(`Skipped unsupported Penpot media metadata ${entryPath}.`);
      continue;
    }

    const storageObject = findPenpotStorageObject(entries, storageObjectId, mediaType);
    if (!storageObject) {
      warnings.push(`Skipped Penpot media ${mediaId} because storage object ${storageObjectId} was not packaged.`);
      continue;
    }
    if (storageObject.mediaType !== mediaType) {
      warnings.push(`Skipped Penpot media ${mediaId} because metadata type ${mediaType} does not match ${storageObject.mediaType}.`);
      continue;
    }

    const declaredSize = positiveNumber(valueFor(storageObject.metadata, 'size'));
    if (declaredSize && declaredSize !== storageObject.data.length) {
      warnings.push(`Skipped Penpot media ${mediaId} because storage object size does not match metadata.`);
      continue;
    }

    const dimensions = dimensionsForImage(storageObject.data, mediaType);
    const naturalWidth = positiveNumber(valueFor(media, 'width')) ?? dimensions?.width;
    const naturalHeight = positiveNumber(valueFor(media, 'height')) ?? dimensions?.height;
    const assetId = penpotAssetStorageId(mediaId);
    mediaById.set(mediaId, {
      mediaId,
      storageObjectId,
      path: storageObject.path,
      naturalWidth,
      naturalHeight,
      metadata: {
        assetId,
        name: stringValue(valueFor(media, 'name')) ?? fileNameForPath(storageObject.path),
        mimeType: mediaType,
        byteLength: storageObject.data.length,
        url: `/assets/${assetId}`
      },
      data: storageObject.data
    });
  }

  return mediaById;
}

function findPenpotStorageObject(
  entries: Map<string, Buffer>,
  storageObjectId: string,
  expectedMediaType: string
): { data: Buffer; mediaType: string; metadata: JsonRecord; path: string } | null {
  const metadata = asRecord(parseJsonEntry(entries, `objects/${storageObjectId}.json`)) ?? {};
  const expectedExtension = extensionForMediaType(expectedMediaType);
  const exactPath = expectedExtension ? `objects/${storageObjectId}${expectedExtension}` : undefined;
  const exactData = exactPath ? entries.get(exactPath) : undefined;
  if (exactData && exactPath) {
    return { data: exactData, mediaType: expectedMediaType, metadata, path: exactPath };
  }

  for (const [entryPath, data] of [...entries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const match = entryPath.match(new RegExp(`^objects/${escapeRegExp(storageObjectId)}(\\.[^/]+)$`));
    if (!match) {
      continue;
    }
    const mediaType = ASSET_MEDIA_TYPES.get(match[1].toLowerCase());
    if (mediaType && IMPORTABLE_IMAGE_MEDIA_TYPES.has(mediaType)) {
      return { data, mediaType, metadata, path: entryPath };
    }
  }

  return null;
}

function penpotFillImageRecordForShape(shape: PenpotShape): JsonRecord | null {
  if (shape.type !== 'rect' && shape.type !== 'frame') {
    return null;
  }
  return recordsFor(valueFor(shape.json, 'fills')).find((fillRecord) =>
    Boolean(asRecord(valueFor(fillRecord, 'fillImage', 'fill-image')))
  ) ?? null;
}

function penpotStrokeImageRecordForShape(shape: PenpotShape): JsonRecord | null {
  if (shape.type !== 'rect' && shape.type !== 'frame') {
    return null;
  }
  return recordsFor(valueFor(shape.json, 'strokes')).find((strokeRecord) =>
    Boolean(asRecord(valueFor(strokeRecord, 'strokeImage', 'stroke-image')))
  ) ?? null;
}

function imageMediaIdForPaintRecord(record: JsonRecord | null, ...imageKeys: string[]): string | undefined {
  const image = asRecord(valueFor(record ?? {}, ...imageKeys));
  return stringValue(valueFor(image ?? {}, 'id'));
}

function imageMediaIdForShape(
  shape: PenpotShape,
  fillImageRecord: JsonRecord | null = penpotFillImageRecordForShape(shape),
  strokeImageRecord: JsonRecord | null = penpotStrokeImageRecordForShape(shape)
): string | undefined {
  if (shape.type === 'image') {
    const metadata = asRecord(valueFor(shape.json, 'metadata'));
    return stringValue(valueFor(metadata ?? {}, 'id'));
  }
  if (shape.type !== 'rect' && shape.type !== 'frame') {
    return undefined;
  }
  return imageMediaIdForPaintRecord(fillImageRecord, 'fillImage', 'fill-image')
    ?? imageMediaIdForPaintRecord(strokeImageRecord, 'strokeImage', 'stroke-image');
}

function pathAssetForShape(shape: PenpotShape): PenpotPackageAsset | undefined {
  const markup = pathSvgMarkupForShape(shape);
  if (!markup) {
    return undefined;
  }

  const data = Buffer.from(markup, 'utf8');
  const assetId = penpotAssetStorageId(`${shape.id}-path-svg`);
  const shapeName = shape.name.trim() || 'Path';
  const name = shapeName.toLowerCase().endsWith('.svg') ? shapeName : `${shapeName}.svg`;
  return {
    mediaId: `${shape.id}-path-svg`,
    storageObjectId: `${shape.id}-path-svg`,
    path: `paths/${assetId}.svg`,
    naturalWidth: positiveNumber(shape.bounds.width),
    naturalHeight: positiveNumber(shape.bounds.height),
    metadata: {
      assetId,
      name,
      mimeType: 'image/svg+xml',
      byteLength: data.length,
      url: `/assets/${assetId}`
    },
    data
  };
}

function pathSvgMarkupForShape(shape: PenpotShape): string | undefined {
  const d = pathDataForShape(shape);
  if (!d) {
    return undefined;
  }

  const width = roundGeometry(Math.max(1, shape.bounds.width));
  const height = roundGeometry(Math.max(1, shape.bounds.height));
  const svgAttrs = new Map<string, string>([
    ['xmlns', 'http://www.w3.org/2000/svg'],
    ['width', String(width)],
    ['height', String(height)],
    ['viewBox', `0 0 ${width} ${height}`]
  ]);
  const pathAttrs = new Map<string, string>([['d', d]]);
  const fillPaint = penpotSolidFillPaint(shape.json);
  const fillColor = fillPaint?.color ?? penpotFillColor(shape.json);
  pathAttrs.set('fill', fillColor ?? 'none');

  const strokeColor = penpotStrokeColor(shape.json);
  if (strokeColor) {
    pathAttrs.set('stroke', strokeColor);
    pathAttrs.set('stroke-width', String(penpotStrokeWidth(shape.json)));
  }

  const opacity = roundOpacity(finiteNumber(valueFor(shape.json, 'opacity'), 1) * (fillPaint?.opacity ?? 1));
  if (opacity < 1) {
    pathAttrs.set('opacity', String(opacity));
  }

  return `<svg${serializeSvgAttributes(svgAttrs)}><path${serializeSvgAttributes(pathAttrs)}/></svg>`;
}

function pathDataForShape(shape: PenpotShape): string | undefined {
  const direct = stringValue(valueFor(shape.json, 'content', 'path', 'pathData', 'path-data', 'd'))?.trim();
  if (direct && looksLikeSvgPathData(direct)) {
    return direct;
  }

  const content = asRecord(valueFor(shape.json, 'content'));
  const recordValue = content
    ? stringValue(valueFor(content, 'd', 'path', 'pathData', 'path-data'))?.trim()
    : undefined;
  if (recordValue && looksLikeSvgPathData(recordValue)) {
    return recordValue;
  }

  return undefined;
}

function penpotPathFillRule(shape: JsonRecord): "nonzero" | "evenodd" {
  const value = stringValue(valueFor(shape, 'fillRule', 'fill-rule'))?.trim().toLowerCase();
  return value === 'evenodd' || value === 'even-odd' ? 'evenodd' : 'nonzero';
}

function looksLikeSvgPathData(value: string): boolean {
  return /[Mm]/.test(value) && /^[MmZzLlHhVvCcSsQqTtAa0-9,\.\-\s]+$/.test(value);
}

function svgRawAssetForShape(shape: PenpotShape, shapesById: Map<string, PenpotShape>): PenpotPackageAsset | undefined {
  const markup = svgRawMarkupForShape(shape, shapesById);
  if (!markup) {
    return undefined;
  }

  const data = Buffer.from(markup, 'utf8');
  const assetId = penpotAssetStorageId(`${shape.id}-svg-raw`);
  const shapeName = shape.name.trim() || 'SVG raw';
  const name = shapeName.toLowerCase().endsWith('.svg') ? shapeName : `${shapeName}.svg`;
  return {
    mediaId: `${shape.id}-svg-raw`,
    storageObjectId: `${shape.id}-svg-raw`,
    path: `svg-raw/${assetId}.svg`,
    naturalWidth: positiveNumber(shape.bounds.width),
    naturalHeight: positiveNumber(shape.bounds.height),
    metadata: {
      assetId,
      name,
      mimeType: 'image/svg+xml',
      byteLength: data.length,
      url: `/assets/${assetId}`
    },
    data
  };
}

function svgRawMarkupForShape(shape: PenpotShape, shapesById: Map<string, PenpotShape>): string | undefined {
  const directMarkup = stringValue(valueFor(shape.json, 'content', 'svg', 'rawSvg', 'raw-svg', 'markup'))?.trim();
  if (directMarkup?.startsWith('<svg')) {
    return directMarkup;
  }

  const content = asRecord(valueFor(shape.json, 'content'));
  if (!content) {
    return undefined;
  }
  const markup = serializeSvgRawContent(content, shape, shapesById, new Set([shape.id]));
  return markup?.startsWith('<svg') ? markup : undefined;
}

function serializeSvgRawContent(
  content: JsonRecord,
  shape: PenpotShape,
  shapesById: Map<string, PenpotShape>,
  visiting: Set<string>
): string | undefined {
  const tag = normalizeSvgRawTag(stringValue(valueFor(content, 'tag')));
  if (!tag || !SVG_RAW_TAGS.has(tag)) {
    return undefined;
  }

  const attrs = svgRawAttributesForContent(content);
  if (tag === 'svg') {
    if (!attrs.has('xmlns')) {
      attrs.set('xmlns', 'http://www.w3.org/2000/svg');
    }
    if (!attrs.has('width')) {
      attrs.set('width', String(roundGeometry(Math.max(1, shape.bounds.width))));
    }
    if (!attrs.has('height')) {
      attrs.set('height', String(roundGeometry(Math.max(1, shape.bounds.height))));
    }
    if (!attrs.has('viewBox')) {
      attrs.set('viewBox', `0 0 ${roundGeometry(Math.max(1, shape.bounds.width))} ${roundGeometry(Math.max(1, shape.bounds.height))}`);
    }
  }

  const inlineChildren = serializeSvgRawInlineContent(valueFor(content, 'content'), shape, shapesById, visiting);
  const shapeChildren = shape.childIds
    .map((childId) => shapesById.get(childId))
    .filter((child): child is PenpotShape => Boolean(child))
    .flatMap((child) => {
      if (visiting.has(child.id)) {
        return [];
      }
      const nextVisiting = new Set(visiting);
      nextVisiting.add(child.id);
      const childContent = valueFor(child.json, 'content');
      if (typeof childContent === 'string') {
        return [escapeSvgText(childContent)];
      }
      const childRecord = asRecord(childContent);
      const serialized = childRecord ? serializeSvgRawContent(childRecord, child, shapesById, nextVisiting) : undefined;
      return serialized ? [serialized] : [];
    })
    .join('');

  return `<${tag}${serializeSvgAttributes(attrs)}>${inlineChildren}${shapeChildren}</${tag}>`;
}

function serializeSvgRawInlineContent(
  value: unknown,
  shape: PenpotShape,
  shapesById: Map<string, PenpotShape>,
  visiting: Set<string>
): string {
  if (typeof value === 'string') {
    return escapeSvgText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeSvgRawInlineContent(entry, shape, shapesById, visiting)).join('');
  }
  if (isRecord(value)) {
    return serializeSvgRawContent(value, shape, shapesById, visiting) ?? '';
  }
  return '';
}

function svgRawAttributesForContent(content: JsonRecord): Map<string, string> {
  const attrs = new Map<string, string>();
  const source = asRecord(valueFor(content, 'svgAttrs', 'svg-attrs', 'attrs', 'attributes')) ?? {};
  for (const [rawName, rawValue] of Object.entries(source)) {
    const name = normalizeSvgAttributeName(rawName);
    const value = svgAttributeValue(rawValue);
    if (name && value !== undefined) {
      attrs.set(name, value);
    }
  }
  return attrs;
}

function normalizeSvgRawTag(value: string | undefined): string | undefined {
  const tag = value?.replace(/^:/, '').trim();
  if (!tag) {
    return undefined;
  }
  if (tag.toLowerCase() === 'textpath') {
    return 'textPath';
  }
  return tag;
}

function normalizeSvgAttributeName(name: string): string | undefined {
  const trimmed = name.replace(/^:/, '').trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('on')) {
    return undefined;
  }
  return trimmed;
}

function svgAttributeValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return undefined;
}

function serializeSvgAttributes(attrs: Map<string, string>): string {
  const serialized = [...attrs.entries()]
    .map(([name, value]) => `${name}="${escapeSvgAttribute(value)}"`)
    .join(' ');
  return serialized ? ` ${serialized}` : '';
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function frameStrokeImageNode(
  shape: PenpotShape,
  asset: PenpotPackageAsset,
  strokeRecord: JsonRecord | null = penpotStrokeImageRecordForShape(shape)
): DesignNode {
  return frameImageNode(shape, asset, {
    idSuffix: 'stroke-image',
    nameSuffix: 'stroke image',
    opacity: finiteNumber(valueFor(strokeRecord ?? {}, 'strokeOpacity', 'stroke-opacity', 'opacity'), 1)
  });
}

function frameImageNode(
  shape: PenpotShape,
  asset: PenpotPackageAsset,
  options: { idSuffix: string; nameSuffix: string; opacity: number }
): DesignNode {
  return {
    id: penpotStorageId(`${shape.id}-${options.idSuffix}`, `${shape.type}-${options.idSuffix}`),
    kind: 'image',
    name: `${shape.name} ${options.nameSuffix}`,
    transform: { x: 0, y: 0, rotation: 0 },
    size: {
      width: roundGeometry(Math.max(1, shape.bounds.width)),
      height: roundGeometry(Math.max(1, shape.bounds.height))
    },
    style: {
      fill: '#f3f4f6',
      stroke: null,
      stroke_width: 0,
      opacity: options.opacity
    },
    content: imageContentForAsset(asset, 'fill'),
    children: []
  };
}

function imageContentForAsset(
  asset: PenpotPackageAsset,
  fitMode: ImageFitMode
): Extract<DesignNode['content'], { type: 'image' }> {
  const content: Extract<DesignNode['content'], { type: 'image' }> = {
    type: 'image',
    asset_id: asset.metadata.assetId,
    fit_mode: fitMode
  };
  if (asset.naturalWidth) {
    content.natural_width = asset.naturalWidth;
  }
  if (asset.naturalHeight) {
    content.natural_height = asset.naturalHeight;
  }
  return content;
}

function isPenpotMaskedGroup(shape: PenpotShape): boolean {
  return shape.type === 'group' && valueFor(shape.json, 'maskedGroup', 'masked-group') === true;
}

function rootShapeIds(pageJson: JsonRecord, shapesById: Map<string, PenpotShape>): string[] {
  const explicitRoots = arrayIds(valueFor(pageJson, 'rootShapes', 'root-shapes', 'children'))
    .filter((shapeId) => shapesById.has(shapeId));
  if (explicitRoots.length > 0) {
    return explicitRoots;
  }

  const referencedIds = new Set<string>();
  for (const shape of shapesById.values()) {
    for (const childId of shape.childIds) {
      referencedIds.add(childId);
    }
  }
  const inferredRoots = [...shapesById.keys()].filter((shapeId) => !referencedIds.has(shapeId));
  return inferredRoots.length > 0 ? inferredRoots : [...shapesById.keys()];
}

function childIdsForShape(shape: JsonRecord): string[] {
  return arrayIds(valueFor(shape, 'shapes', 'children'));
}

function arrayIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const direct = stringValue(entry);
    if (direct) {
      return [direct];
    }
    if (isRecord(entry)) {
      const id = stringValue(valueFor(entry, 'id'));
      return id ? [id] : [];
    }
    return [];
  });
}

function isPenpotExportManifest(value: unknown): value is JsonRecord {
  if (!isRecord(value)) {
    return false;
  }
  const type = stringValue(valueFor(value, 'type'));
  return type === 'penpot/export-files' && Array.isArray(value.files);
}

function firstFileIdFromEntries(entries: Map<string, Buffer>): string | undefined {
  for (const entryPath of entries.keys()) {
    const match = entryPath.match(/^files\/([^/]+)\.json$/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function parseJsonEntry(entries: Map<string, Buffer>, entryPath: string): unknown | undefined {
  const data = entries.get(entryPath);
  return data ? parseJsonBuffer(data) : undefined;
}

function parseJsonBuffer(data: Buffer): unknown | undefined {
  const text = data.toString('utf8').trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function boundsForShape(shape: JsonRecord): PenpotBounds {
  const selrect = asRecord(valueFor(shape, 'selrect', 'selRect'));
  const size = asRecord(valueFor(shape, 'size'));
  return {
    x: finiteNumber(valueFor(shape, 'x', 'left'), finiteNumber(valueFor(selrect ?? {}, 'x', 'left'), 0)),
    y: finiteNumber(valueFor(shape, 'y', 'top'), finiteNumber(valueFor(selrect ?? {}, 'y', 'top'), 0)),
    width: finiteNumber(valueFor(shape, 'width', 'w'), finiteNumber(valueFor(selrect ?? {}, 'width', 'w', 'x2'), finiteNumber(valueFor(size ?? {}, 'width', 'x'), 100))),
    height: finiteNumber(valueFor(shape, 'height', 'h'), finiteNumber(valueFor(selrect ?? {}, 'height', 'h', 'y2'), finiteNumber(valueFor(size ?? {}, 'height', 'y'), 48)))
  };
}

function penpotFillColor(shape: JsonRecord): string | null {
  return penpotSolidFillPaint(shape)?.color ?? colorValue(valueFor(shape, 'fillColor', 'fill-color', 'color'));
}

function penpotSolidFillPaint(shape: JsonRecord): PenpotSolidFillPaint | null {
  const fillRecords = recordsFor(valueFor(shape, 'fills'));
  const fills = (fillRecords.length > 0 ? fillRecords : [shape]).flatMap((fill) => {
    const solidColor = colorValue(valueFor(fill, 'fillColor', 'fill-color', 'color'));
    const gradientPaint = solidColor ? null : penpotGradientFillPaint(fill);
    const color = solidColor ?? gradientPaint?.color;
    if (!color) {
      return [];
    }
    const fillOpacity = clampOpacity(finiteNumber(valueFor(fill, 'fillOpacity', 'fill-opacity', 'opacity'), 1));
    return [
      {
        color,
        opacity: roundOpacity((gradientPaint?.opacity ?? 1) * fillOpacity)
      }
    ];
  });

  if (fills.length === 0) {
    return null;
  }

  let composite: RgbaColor = { r: 0, g: 0, b: 0, a: 0 };
  for (const fill of [...fills].reverse()) {
    composite = compositeRgba(hexToRgba(fill.color, fill.opacity), composite);
  }

  return {
    color: rgbaToHex(composite),
    opacity: roundOpacity(composite.a)
  };
}

function penpotGradientFillPaint(fill: JsonRecord): PenpotSolidFillPaint | null {
  return penpotGradientPaint(fill, ['fillColorGradient', 'fill-color-gradient', 'gradient']);
}

function penpotGradientStrokePaint(stroke: JsonRecord): PenpotSolidFillPaint | null {
  return penpotGradientPaint(stroke, ['strokeColorGradient', 'stroke-color-gradient', 'gradient']);
}

function penpotGradientPaint(record: JsonRecord, gradientKeys: string[]): PenpotSolidFillPaint | null {
  const gradient = asRecord(valueFor(record, ...gradientKeys));
  if (!gradient) {
    return null;
  }

  const stops = recordsFor(valueFor(gradient, 'stops'))
    .flatMap((stop) => {
      const color = colorValue(valueFor(stop, 'color', 'fillColor', 'fill-color', 'strokeColor', 'stroke-color'));
      if (!color) {
        return [];
      }
      return [
        {
          ...hexToRgba(
            color,
            clampOpacity(
              finiteNumber(valueFor(stop, 'opacity', 'fillOpacity', 'fill-opacity', 'strokeOpacity', 'stroke-opacity'), 1)
            )
          ),
          offset: clampOpacity(finiteNumber(valueFor(stop, 'offset'), 0))
        }
      ];
    })
    .sort((left, right) => left.offset - right.offset);

  if (stops.length === 0) {
    return null;
  }

  const midpoint = interpolateGradientStops(stops, 0.5);
  return {
    color: rgbaToHex(midpoint),
    opacity: roundOpacity(midpoint.a)
  };
}

function interpolateGradientStops(stops: Array<RgbaColor & { offset: number }>, offset: number): RgbaColor {
  const targetOffset = clampOpacity(offset);
  const endIndex = stops.findIndex((stop) => targetOffset <= stop.offset);
  if (endIndex < 0) {
    return stops[stops.length - 1];
  }
  if (endIndex === 0) {
    return stops[0];
  }

  const start = stops[endIndex - 1];
  const end = stops[endIndex];
  const span = end.offset - start.offset;
  const progress = span === 0 ? 0 : clampOpacity((targetOffset - start.offset) / span);
  return {
    r: start.r + (end.r - start.r) * progress,
    g: start.g + (end.g - start.g) * progress,
    b: start.b + (end.b - start.b) * progress,
    a: start.a + (end.a - start.a) * progress
  };
}

function hexToRgba(color: string, opacity: number): RgbaColor {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
    a: opacity
  };
}

function compositeRgba(source: RgbaColor, destination: RgbaColor): RgbaColor {
  const sourceAlpha = clampOpacity(source.a);
  const destinationAlpha = clampOpacity(destination.a);
  const alpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: (source.r * sourceAlpha + destination.r * destinationAlpha * (1 - sourceAlpha)) / alpha,
    g: (source.g * sourceAlpha + destination.g * destinationAlpha * (1 - sourceAlpha)) / alpha,
    b: (source.b * sourceAlpha + destination.b * destinationAlpha * (1 - sourceAlpha)) / alpha,
    a: alpha
  };
}

function rgbaToHex(color: RgbaColor): string {
  return `#${colorChannelToHex(color.r)}${colorChannelToHex(color.g)}${colorChannelToHex(color.b)}`;
}

function colorChannelToHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function clampOpacity(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundOpacity(value: number): number {
  return Math.round(clampOpacity(value) * 1000) / 1000;
}

function penpotGradientDefinition(record: JsonRecord, kind: 'fill' | 'stroke'): NodePaintGradient | null {
  const gradient = asRecord(
    kind === 'fill'
      ? valueFor(record, 'fillColorGradient', 'fill-color-gradient', 'gradient')
      : valueFor(record, 'strokeColorGradient', 'stroke-color-gradient', 'gradient')
  );
  if (!gradient) return null;
  const stops = recordsFor(valueFor(gradient, 'stops')).flatMap((stop) => {
    const color = colorValue(valueFor(stop, 'color', 'strokeColor', 'stroke-color', 'fillColor', 'fill-color'));
    if (!color) return [];
    return [{
      color,
      opacity: clampOpacity(finiteNumber(valueFor(stop, 'opacity', 'strokeOpacity', 'stroke-opacity'), 1)),
      offset: clampOpacity(finiteNumber(valueFor(stop, 'offset'), 0))
    }];
  });
  if (stops.length < 2) return null;
  const point = (prefix: 'start' | 'end') => {
    const record = asRecord(valueFor(gradient, prefix, `${prefix}Point`, `${prefix}-point`));
    if (record) {
      return { x: finiteNumber(valueFor(record, 'x'), 0), y: finiteNumber(valueFor(record, 'y'), 0) };
    }
    const x = finiteNumber(valueFor(gradient, `${prefix}X`, `${prefix}-x`), Number.NaN);
    const y = finiteNumber(valueFor(gradient, `${prefix}Y`, `${prefix}-y`), Number.NaN);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
  };
  const type = stringValue(valueFor(gradient, 'type'));
  const start = point('start');
  const end = point('end');
  const width = finiteNumber(valueFor(gradient, 'width'), Number.NaN);
  return {
    ...(type ? { type } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(Number.isFinite(width) && width >= 0 ? { width } : {}),
    stops
  };
}

function penpotFillStack(shape: JsonRecord, assetsById: Map<string, PenpotPackageAsset>): NodeFill[] {
  const blendModes = new Set([
    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
    'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
  ]);
  return recordsFor(valueFor(shape, 'fills')).flatMap((record, index) => {
    const solidColor = colorValue(valueFor(record, 'fillColor', 'fill-color', 'color'));
    const gradient = penpotGradientDefinition(record, 'fill');
    const imageMediaId = imageMediaIdForPaintRecord(record, 'fillImage', 'fill-image');
    const imageAsset = imageMediaId ? assetsById.get(imageMediaId) : undefined;
    const fallback = solidColor ?? penpotGradientFillPaint(record)?.color ?? '#ffffff';
    const rawBlendMode = (stringValue(valueFor(record, 'blendMode', 'blend-mode')) ?? 'normal')
      .replace(/^:/, '')
      .replaceAll('_', '-')
      .toLowerCase();
    const blend_mode = blendModes.has(rawBlendMode) ? rawBlendMode as NodeFill['blend_mode'] : 'normal';
    const paint = imageAsset
      ? { type: 'image' as const, asset_id: imageAsset.metadata.assetId }
      : gradient
        ? { type: 'gradient' as const, gradient }
        : { type: 'solid' as const, color: fallback };
    return [{
      id: `penpot-fill-${index + 1}`,
      color: fallback,
      paint,
      opacity: clampOpacity(finiteNumber(valueFor(record, 'fillOpacity', 'fill-opacity', 'opacity'), 1)),
      visible: valueFor(record, 'hidden') !== true,
      blend_mode
    } satisfies NodeFill];
  });
}

function penpotStrokeStack(shape: JsonRecord, assetsById: Map<string, PenpotPackageAsset>): NodeStroke[] {
  return recordsFor(valueFor(shape, 'strokes')).flatMap((record, index) => {
    const solidColor = colorValue(valueFor(record, 'strokeColor', 'stroke-color', 'color'));
    const gradient = penpotGradientDefinition(record, 'stroke');
    const imageMediaId = imageMediaIdForPaintRecord(record, 'strokeImage', 'stroke-image');
    const imageAsset = imageMediaId ? assetsById.get(imageMediaId) : undefined;
    const fallback = solidColor ?? penpotGradientStrokePaint(record)?.color ?? '#000000';
    const alignment = (stringValue(valueFor(record, 'strokeAlignment', 'stroke-alignment')) ?? 'center').toLowerCase();
    const position = alignment.includes('inner') || alignment.includes('inside')
      ? 'inside'
      : alignment.includes('outer') || alignment.includes('outside')
        ? 'outside'
        : 'center';
    const styleValue = (stringValue(valueFor(record, 'strokeStyle', 'stroke-style')) ?? 'solid').toLowerCase();
    const style = styleValue.includes('dot') ? 'dotted' : styleValue.includes('dash') ? 'dashed' : 'solid';
    const dasharrayValue = valueFor(record, 'strokeDasharray', 'stroke-dasharray');
    const dasharray = Array.isArray(dasharrayValue)
      ? dasharrayValue
          .map((value) => finiteNumber(value, Number.NaN))
          .filter((value) => Number.isFinite(value) && value >= 0)
      : [];
    const paint = imageAsset
      ? { type: 'image' as const, asset_id: imageAsset.metadata.assetId }
      : gradient
        ? { type: 'gradient' as const, gradient }
        : { type: 'solid' as const, color: fallback };
    return [{
      id: `penpot-stroke-${index + 1}`,
      color: fallback,
      paint,
      opacity: clampOpacity(finiteNumber(valueFor(record, 'strokeOpacity', 'stroke-opacity', 'opacity'), 1)),
      width: Math.max(0, finiteNumber(valueFor(record, 'strokeWidth', 'stroke-width', 'width'), 1)),
      position,
      style,
      visible: valueFor(record, 'hidden') !== true,
      dasharray,
      cap: 'butt',
      join: 'miter',
      start_marker: 'none',
      end_marker: 'none'
    } satisfies NodeStroke];
  });
}

function penpotSolidStrokePaint(shape: JsonRecord): PenpotSolidFillPaint | null {
  const strokeRecords = recordsFor(valueFor(shape, 'strokes'));
  const strokes = (strokeRecords.length > 0 ? strokeRecords : [shape]).flatMap((stroke) => {
    const solidColor = colorValue(valueFor(stroke, 'strokeColor', 'stroke-color', 'color'));
    const gradientPaint = solidColor ? null : penpotGradientStrokePaint(stroke);
    const color = solidColor ?? gradientPaint?.color;
    if (!color) {
      return [];
    }
    const strokeOpacity = clampOpacity(finiteNumber(valueFor(stroke, 'strokeOpacity', 'stroke-opacity', 'opacity'), 1));
    return [
      {
        color,
        opacity: roundOpacity((gradientPaint?.opacity ?? 1) * strokeOpacity)
      }
    ];
  });

  if (strokes.length === 0) {
    return null;
  }

  let composite: RgbaColor = { r: 0, g: 0, b: 0, a: 0 };
  for (const stroke of [...strokes].reverse()) {
    composite = compositeRgba(hexToRgba(stroke.color, stroke.opacity), composite);
  }

  return {
    color: rgbaToHex(composite),
    opacity: roundOpacity(composite.a)
  };
}

function penpotStrokeColor(shape: JsonRecord): string | null {
  return penpotSolidStrokePaint(shape)?.color ?? null;
}

function penpotStrokeWidth(shape: JsonRecord): number {
  const strokeRecords = recordsFor(valueFor(shape, 'strokes'));
  const widthSources = strokeRecords.length > 0 ? strokeRecords : [shape];
  const widths = widthSources
    .map((stroke) => finiteNumber(valueFor(stroke, 'strokeWidth', 'stroke-width', 'width'), Number.NaN))
    .filter((width) => Number.isFinite(width) && width >= 0);
  return widths.length > 0 ? Math.max(...widths) : 1;
}

function firstRecord(value: unknown): JsonRecord | null {
  return recordsFor(value)[0] ?? null;
}

function recordsFor(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  return isRecord(value) ? [value] : [];
}

function colorValue(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  const shortHex = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    return `#${shortHex[1]
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toLowerCase();
  }
  const hex = trimmed.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  return hex ? `#${hex[1]}`.toLowerCase() : null;
}

function defaultFillForPenpotType(type: string): string {
  if (type === 'text') {
    return '#111827';
  }
  if (type === 'frame' || type === 'group') {
    return '#ffffff';
  }
  return '#e5e7eb';
}

function normalizeShapeType(value: string | undefined): string | undefined {
  return value?.replace(/^:/, '').toLowerCase();
}

function penpotStorageId(value: unknown, fallback: string): string {
  const source = stringValue(value) ?? fallback;
  return `penpot-${storageIdSegment(source)}`;
}

function penpotAssetStorageId(value: string): string {
  return `penpot-asset-${storageIdSegment(value)}`;
}

function safeStorageId(value: string | undefined, fallback: string): string {
  const source = value?.trim() || `${fallback}-${Date.now().toString(36)}`;
  return storageIdSegment(source);
}

function storageIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'imported';
}

function normalizeImportName(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback.trim() || 'Imported Penpot';
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function positiveNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function roundGeometry(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function valueFor(record: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extensionForMediaType(mediaType: string): string | undefined {
  for (const [extension, candidate] of ASSET_MEDIA_TYPES.entries()) {
    if (candidate === mediaType) {
      return extension;
    }
  }
  return undefined;
}

function fileNameForPath(entryPath: string): string {
  return entryPath.split('/').pop()?.trim() || 'image';
}

function dimensionsForImage(data: Buffer, mediaType: string): { width: number; height: number } | null {
  if (mediaType === 'image/png' && data.length >= 24 && data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  const textHeader = data.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (mediaType === 'image/svg+xml' && textHeader.startsWith('<svg')) {
    const width = numberAttribute(textHeader, 'width');
    const height = numberAttribute(textHeader, 'height');
    return width && height ? { width, height } : null;
  }

  return null;
}

function numberAttribute(text: string, attributeName: 'width' | 'height'): number | null {
  const match = text.match(new RegExp(`${attributeName}=["']([0-9.]+)`));
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function escapeRegExp(value: string): string {
  const specials = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
  return [...value].map((char) => (specials.has(char) ? `\\${char}` : char)).join('');
}

function inputValidationError(message: string): Error {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = 'CANVAS_INPUT_VALIDATION';
  error.statusCode = 400;
  return error;
}
