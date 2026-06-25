import type { DesignFile, DesignNode, NodeConstraints, NodeLayout, NodeLayoutItem } from "./storage.js";

const MIN_NODE_SIZE = 1;
const DEFAULT_CONSTRAINTS: NodeConstraints = { horizontal: "left", vertical: "top" };
const DEFAULT_LAYOUT_ITEM: NodeLayoutItem = { position: "static", margin: { top: 0, right: 0, bottom: 0, left: 0 } };

export function relayoutDesignFile(document: DesignFile): void {
  for (const page of document.pages) {
    for (const node of page.children) {
      relayoutNode(node);
    }
  }
}

export function relayoutNode(node: DesignNode): void {
  const layout = normalizedAutoLayout(node.layout);
  if (layout) {
    const isVertical = layout.direction === "vertical";
    const flowChildren = node.children.filter((child) => layoutItemPosition(child.layout_item) === "static");
    if (layout.wrap === "wrap") {
      relayoutWrappedChildren(node, layout, flowChildren, isVertical);
    } else {
      relayoutSingleLineChildren(node, layout, flowChildren, isVertical);
    }
  }

  for (const child of node.children) {
    relayoutNode(child);
  }
}

function relayoutSingleLineChildren(
  node: DesignNode,
  layout: NodeLayout,
  flowChildren: DesignNode[],
  isVertical: boolean
): void {
  const childCount = flowChildren.length;
  const mainStartPadding = isVertical ? layout.padding.top : layout.padding.left;
  const mainEndPadding = isVertical ? layout.padding.bottom : layout.padding.right;
  const crossStartPadding = isVertical ? layout.padding.left : layout.padding.top;
  const crossEndPadding = isVertical ? layout.padding.right : layout.padding.bottom;
  const availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  const availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
  const mainGap = mainAxisGap(layout, isVertical);
  const childMetrics = flowChildren.map((child) => childLayoutMetrics(child, isVertical));
  const totalChildMain =
    childMetrics.reduce(
      (total, metrics) => total + metrics.mainBefore + metrics.mainSize + metrics.mainAfter,
      0
    ) + mainGap * Math.max(0, childCount - 1);
  const remainingMain = Math.max(0, availableMain - totalChildMain);
  let cursor = mainStartPadding + justifyStartOffset(layout.justify_content, remainingMain, childCount);
  const distributedGap = mainGap + justifyGapOffset(layout.justify_content, remainingMain, childCount);

  flowChildren.forEach((child, index) => {
    const metrics = childMetrics[index];
    const crossAxisPosition = crossAxisOffset(
      layout.align_items,
      crossStartPadding,
      crossEndPadding,
      availableCross,
      metrics.crossSize,
      isVertical ? node.size.width : node.size.height,
      metrics.crossBefore,
      metrics.crossAfter
    );
    if (layout.align_items === "stretch") {
      const stretchedCrossSize = clampSize(availableCross - metrics.crossBefore - metrics.crossAfter);
      if (isVertical) {
        child.size.width = stretchedCrossSize;
      } else {
        child.size.height = stretchedCrossSize;
      }
    }
    child.transform = {
      ...child.transform,
      x: isVertical ? crossAxisPosition : cursor + metrics.mainBefore,
      y: isVertical ? cursor + metrics.mainBefore : crossAxisPosition
    };
    cursor += metrics.mainBefore + (isVertical ? child.size.height : child.size.width) + metrics.mainAfter + distributedGap;
  });
}

function relayoutWrappedChildren(
  node: DesignNode,
  layout: NodeLayout,
  flowChildren: DesignNode[],
  isVertical: boolean
): void {
  const mainStartPadding = isVertical ? layout.padding.top : layout.padding.left;
  const mainEndPadding = isVertical ? layout.padding.bottom : layout.padding.right;
  const crossStartPadding = isVertical ? layout.padding.left : layout.padding.top;
  const crossEndPadding = isVertical ? layout.padding.right : layout.padding.bottom;
  const availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  const availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
  const mainGap = mainAxisGap(layout, isVertical);
  const crossGap = crossAxisGap(layout, isVertical);
  const lines = buildFlexLines(flowChildren, isVertical, availableMain, mainGap);
  const totalLineCross =
    lines.reduce((total, line) => total + line.crossSize, 0) + crossGap * Math.max(0, lines.length - 1);
  const remainingCross = Math.max(0, availableCross - totalLineCross);
  const alignContent = layout.align_content ?? "start";
  let crossCursor = crossStartPadding + justifyStartOffset(alignContent, remainingCross, lines.length);
  const lineGap = crossGap + justifyGapOffset(alignContent, remainingCross, lines.length);

  for (const line of lines) {
    const remainingMain = Math.max(0, availableMain - line.mainSize);
    let mainCursor = mainStartPadding + justifyStartOffset(layout.justify_content, remainingMain, line.children.length);
    const distributedGap = mainGap + justifyGapOffset(layout.justify_content, remainingMain, line.children.length);

    for (const entry of line.children) {
      const { child, metrics } = entry;
      const crossAxisPosition = crossAxisLineOffset(
        layout.align_items,
        crossCursor,
        line.crossSize,
        metrics.crossSize,
        metrics.crossBefore,
        metrics.crossAfter
      );
      if (layout.align_items === "stretch") {
        const stretchedCrossSize = clampSize(line.crossSize - metrics.crossBefore - metrics.crossAfter);
        if (isVertical) {
          child.size.width = stretchedCrossSize;
        } else {
          child.size.height = stretchedCrossSize;
        }
      }
      child.transform = {
        ...child.transform,
        x: isVertical ? crossAxisPosition : mainCursor + metrics.mainBefore,
        y: isVertical ? mainCursor + metrics.mainBefore : crossAxisPosition
      };
      mainCursor += metrics.mainBefore + (isVertical ? child.size.height : child.size.width) + metrics.mainAfter + distributedGap;
    }

    crossCursor += line.crossSize + lineGap;
  }
}

function mainAxisGap(layout: NodeLayout, isVertical: boolean): number {
  return isVertical ? layout.row_gap ?? layout.gap : layout.column_gap ?? layout.gap;
}

function crossAxisGap(layout: NodeLayout, isVertical: boolean): number {
  return isVertical ? layout.column_gap ?? layout.gap : layout.row_gap ?? layout.gap;
}

function buildFlexLines(children: DesignNode[], isVertical: boolean, availableMain: number, gap: number) {
  const lines: Array<{
    children: Array<{ child: DesignNode; metrics: ReturnType<typeof childLayoutMetrics> }>;
    mainSize: number;
    crossSize: number;
  }> = [];
  let currentLine: (typeof lines)[number] | null = null;

  for (const child of children) {
    const metrics = childLayoutMetrics(child, isVertical);
    const itemMainSize = metrics.mainBefore + metrics.mainSize + metrics.mainAfter;
    const itemCrossSize = metrics.crossBefore + metrics.crossSize + metrics.crossAfter;
    const nextMainSize = currentLine
      ? currentLine.mainSize + gap + itemMainSize
      : itemMainSize;

    if (currentLine && currentLine.children.length > 0 && nextMainSize > availableMain) {
      lines.push(currentLine);
      currentLine = null;
    }

    if (!currentLine) {
      currentLine = { children: [], mainSize: 0, crossSize: 0 };
    }

    currentLine.children.push({ child, metrics });
    currentLine.mainSize = currentLine.children.length === 1
      ? itemMainSize
      : currentLine.mainSize + gap + itemMainSize;
    currentLine.crossSize = Math.max(currentLine.crossSize, itemCrossSize);
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export function applyConstraintsAfterParentResize(
  parent: DesignNode,
  previousSize: { width: number; height: number }
): void {
  if (normalizedAutoLayout(parent.layout)) {
    return;
  }

  const deltaWidth = parent.size.width - previousSize.width;
  const deltaHeight = parent.size.height - previousSize.height;
  if (deltaWidth === 0 && deltaHeight === 0) {
    return;
  }

  for (const child of parent.children) {
    const constraints = normalizeNodeConstraints(child.constraints ?? DEFAULT_CONSTRAINTS);
    applyHorizontalConstraint(child, constraints.horizontal, previousSize.width, parent.size.width, deltaWidth);
    applyVerticalConstraint(child, constraints.vertical, previousSize.height, parent.size.height, deltaHeight);
  }
}

export function normalizeNodeLayout(layout: NodeLayout): NodeLayout {
  const wrap = isLayoutWrap(layout.wrap) ? layout.wrap : "nowrap";
  const alignContent = isLayoutAlignContent(layout.align_content) ? layout.align_content : "start";
  const gap = Math.max(0, finiteNumber(layout.gap, 0));
  const rowGap = Math.max(0, finiteNumber(layout.row_gap, gap));
  const columnGap = Math.max(0, finiteNumber(layout.column_gap, gap));
  return {
    mode: layout.mode === "auto" ? "auto" : "none",
    direction: layout.direction === "horizontal" ? "horizontal" : "vertical",
    ...(wrap === "wrap" ? { wrap } : {}),
    align_items: isLayoutAlignItems(layout.align_items) ? layout.align_items : "start",
    justify_content: isLayoutJustifyContent(layout.justify_content) ? layout.justify_content : "start",
    ...(wrap === "wrap" || alignContent !== "start" ? { align_content: alignContent } : {}),
    gap,
    ...(rowGap !== gap ? { row_gap: rowGap } : {}),
    ...(columnGap !== gap ? { column_gap: columnGap } : {}),
    padding: {
      top: Math.max(0, finiteNumber(layout.padding?.top, 0)),
      right: Math.max(0, finiteNumber(layout.padding?.right, 0)),
      bottom: Math.max(0, finiteNumber(layout.padding?.bottom, 0)),
      left: Math.max(0, finiteNumber(layout.padding?.left, 0))
    }
  };
}

export function normalizeNodeLayoutItem(layoutItem: NodeLayoutItem): NodeLayoutItem {
  const position = layoutItemPosition(layoutItem);
  return {
    ...(position === "absolute" ? { position } : {}),
    margin: {
      top: Math.max(0, finiteNumber(layoutItem.margin?.top, 0)),
      right: Math.max(0, finiteNumber(layoutItem.margin?.right, 0)),
      bottom: Math.max(0, finiteNumber(layoutItem.margin?.bottom, 0)),
      left: Math.max(0, finiteNumber(layoutItem.margin?.left, 0))
    }
  };
}

function layoutItemPosition(layoutItem: NodeLayoutItem | null | undefined): "static" | "absolute" {
  return layoutItem?.position === "absolute" ? "absolute" : "static";
}

export function normalizeNodeConstraints(constraints: NodeConstraints): NodeConstraints {
  return {
    horizontal: isHorizontalConstraint(constraints.horizontal) ? constraints.horizontal : "left",
    vertical: isVerticalConstraint(constraints.vertical) ? constraints.vertical : "top"
  };
}

function normalizedAutoLayout(layout: NodeLayout | null | undefined): NodeLayout | null {
  if (!layout || layout.mode !== "auto") {
    return null;
  }

  return normalizeNodeLayout(layout);
}

function applyHorizontalConstraint(
  node: DesignNode,
  constraint: NodeConstraints["horizontal"],
  previousParentWidth: number,
  nextParentWidth: number,
  deltaWidth: number
): void {
  if (constraint === "right") {
    node.transform.x += deltaWidth;
    return;
  }
  if (constraint === "center") {
    node.transform.x += deltaWidth / 2;
    return;
  }
  if (constraint === "left_right") {
    node.size.width = clampSize(node.size.width + deltaWidth);
    return;
  }
  if (constraint === "scale" && previousParentWidth > 0) {
    const xRatio = node.transform.x / previousParentWidth;
    const widthRatio = node.size.width / previousParentWidth;
    node.transform.x = xRatio * nextParentWidth;
    node.size.width = clampSize(widthRatio * nextParentWidth);
  }
}

function applyVerticalConstraint(
  node: DesignNode,
  constraint: NodeConstraints["vertical"],
  previousParentHeight: number,
  nextParentHeight: number,
  deltaHeight: number
): void {
  if (constraint === "bottom") {
    node.transform.y += deltaHeight;
    return;
  }
  if (constraint === "center") {
    node.transform.y += deltaHeight / 2;
    return;
  }
  if (constraint === "top_bottom") {
    node.size.height = clampSize(node.size.height + deltaHeight);
    return;
  }
  if (constraint === "scale" && previousParentHeight > 0) {
    const yRatio = node.transform.y / previousParentHeight;
    const heightRatio = node.size.height / previousParentHeight;
    node.transform.y = yRatio * nextParentHeight;
    node.size.height = clampSize(heightRatio * nextParentHeight);
  }
}

function isHorizontalConstraint(value: string): value is NodeConstraints["horizontal"] {
  return ["left", "right", "left_right", "center", "scale"].includes(value);
}

function isVerticalConstraint(value: string): value is NodeConstraints["vertical"] {
  return ["top", "bottom", "top_bottom", "center", "scale"].includes(value);
}

function isLayoutWrap(value: string | undefined): value is NonNullable<NodeLayout["wrap"]> {
  return value === "nowrap" || value === "wrap";
}

function isLayoutAlignItems(value: string): value is NodeLayout["align_items"] {
  return ["start", "center", "end", "stretch"].includes(value);
}

function isLayoutJustifyContent(value: string): value is NodeLayout["justify_content"] {
  return ["start", "center", "end", "space_between", "space_around", "space_evenly"].includes(value);
}

function isLayoutAlignContent(value: string | undefined): value is NonNullable<NodeLayout["align_content"]> {
  return value === "start" || value === "center" || value === "end" || value === "space_between" || value === "space_around" || value === "space_evenly";
}

function justifyStartOffset(
  justifyContent: NodeLayout["justify_content"],
  remainingMain: number,
  childCount: number
): number {
  if (justifyContent === "center") {
    return remainingMain / 2;
  }
  if (justifyContent === "end") {
    return remainingMain;
  }
  if (justifyContent === "space_around" && childCount > 0) {
    return remainingMain / childCount / 2;
  }
  if (justifyContent === "space_evenly" && childCount > 0) {
    return remainingMain / (childCount + 1);
  }
  return 0;
}

function justifyGapOffset(
  justifyContent: NodeLayout["justify_content"],
  remainingMain: number,
  childCount: number
): number {
  if (justifyContent === "space_between" && childCount > 1) {
    return remainingMain / (childCount - 1);
  }
  if (justifyContent === "space_around" && childCount > 0) {
    return remainingMain / childCount;
  }
  if (justifyContent === "space_evenly" && childCount > 0) {
    return remainingMain / (childCount + 1);
  }
  return 0;
}

function crossAxisOffset(
  alignItems: NodeLayout["align_items"],
  crossStartPadding: number,
  crossEndPadding: number,
  availableCross: number,
  childCrossSize: number,
  parentCrossSize: number,
  crossBefore: number,
  crossAfter: number
): number {
  if (alignItems === "center") {
    return crossStartPadding + Math.max(0, availableCross - crossBefore - childCrossSize - crossAfter) / 2 + crossBefore;
  }
  if (alignItems === "end") {
    return parentCrossSize - crossEndPadding - crossAfter - childCrossSize;
  }
  return crossStartPadding + crossBefore;
}

function crossAxisLineOffset(
  alignItems: NodeLayout["align_items"],
  lineCrossStart: number,
  lineCrossSize: number,
  childCrossSize: number,
  crossBefore: number,
  crossAfter: number
): number {
  if (alignItems === "center") {
    return lineCrossStart + Math.max(0, lineCrossSize - crossBefore - childCrossSize - crossAfter) / 2 + crossBefore;
  }
  if (alignItems === "end") {
    return lineCrossStart + lineCrossSize - crossAfter - childCrossSize;
  }
  return lineCrossStart + crossBefore;
}

function childLayoutMetrics(child: DesignNode, isVertical: boolean) {
  const margin = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM).margin;
  return {
    mainBefore: isVertical ? margin.top : margin.left,
    mainAfter: isVertical ? margin.bottom : margin.right,
    mainSize: isVertical ? child.size.height : child.size.width,
    crossBefore: isVertical ? margin.left : margin.top,
    crossAfter: isVertical ? margin.right : margin.bottom,
    crossSize: isVertical ? child.size.width : child.size.height
  };
}

function clampSize(value: number): number {
  return Math.max(MIN_NODE_SIZE, value);
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
