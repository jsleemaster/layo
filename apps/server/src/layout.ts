import type { DesignFile, DesignNode, GridArea, GridTrack, NodeConstraints, NodeLayout, NodeLayoutItem } from "./storage.js";

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
  const layout = normalizedFlowLayout(node.layout);
  if (layout) {
    const isVertical = layout.direction === "vertical";
    const flowChildren = node.children.filter((child) => layoutItemPosition(child.layout_item) === "static");
    if (layout.mode === "grid") {
      relayoutGridChildren(node, layout, flowChildren);
    } else if (layout.wrap === "wrap") {
      relayoutWrappedChildren(node, layout, flowChildren, isVertical);
    } else {
      relayoutSingleLineChildren(node, layout, flowChildren, isVertical);
    }
  }

  for (const child of node.children) {
    relayoutNode(child);
  }
}

type GridCell = { row: number; column: number };

type GridPlacement = GridCell & { rowSpan: number; columnSpan: number };

type GridAutoCell = GridCell & { nextCursor: number };

function relayoutGridChildren(node: DesignNode, layout: NodeLayout, flowChildren: DesignNode[]): void {
  const columnGap = layout.column_gap ?? layout.gap;
  const rowGap = layout.row_gap ?? layout.gap;
  let columns = gridTrackCount(layout.grid_column_tracks, layout.grid_columns, 2);
  let rows = gridTrackCount(layout.grid_row_tracks, layout.grid_rows, Math.max(1, Math.ceil(flowChildren.length / columns)));
  if (layout.direction === "vertical") {
    columns = Math.max(columns, Math.ceil(flowChildren.length / rows), 1);
  } else {
    rows = Math.max(rows, Math.ceil(flowChildren.length / columns), 1);
  }
  const availableWidth = Math.max(
    0,
    node.size.width - layout.padding.left - layout.padding.right - columnGap * Math.max(0, columns - 1)
  );
  const availableHeight = Math.max(
    0,
    node.size.height - layout.padding.top - layout.padding.bottom - rowGap * Math.max(0, rows - 1)
  );
  const manualPlacements = new Map<string, GridPlacement>();
  const areaPlacements = gridAreaPlacementsByName(layout.grid_areas, columns, rows);
  const occupiedCells = new Set<string>();

  for (const child of flowChildren) {
    const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    const manualPlacement = namedGridAreaPlacement(layoutItem, areaPlacements) ?? manualGridPlacement(layoutItem, columns, rows);
    if (manualPlacement) {
      manualPlacements.set(child.id, manualPlacement);
      for (const occupiedCell of gridPlacementCells(manualPlacement)) {
        occupiedCells.add(gridCellKey(occupiedCell));
      }
    }
  }

  let autoCursor = 0;

  flowChildren.forEach((child) => {
    const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    const manualPlacement = manualPlacements.get(child.id);
    let placement: GridPlacement;
    if (manualPlacement) {
      placement = manualPlacement;
    } else {
      const autoCell = nextAutoGridCell(autoCursor, columns, rows, occupiedCells, layout.direction);
      autoCursor = autoCell.nextCursor;
      placement = { row: autoCell.row, column: autoCell.column, rowSpan: 1, columnSpan: 1 };
      occupiedCells.add(gridCellKey(autoCell));
    }
    manualPlacements.set(child.id, placement);
  });

  const columnTracks = resolveGridTracks(layout.grid_column_tracks, columns);
  const rowTracks = resolveGridTracks(layout.grid_row_tracks, rows);
  const columnSizes = resolveGridTrackSizes(columnTracks, availableWidth, "column", flowChildren, manualPlacements);
  const rowSizes = resolveGridTrackSizes(rowTracks, availableHeight, "row", flowChildren, manualPlacements);
  const columnStarts = gridTrackStarts(columnSizes, columnGap);
  const rowStarts = gridTrackStarts(rowSizes, rowGap);

  flowChildren.forEach((child) => {
    const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    const placement = manualPlacements.get(child.id) ?? { row: 0, column: 0, rowSpan: 1, columnSpan: 1 };
    const { row, column } = placement;
    const margin = layoutItem.margin;
    const placementWidth = gridPlacementTrackSize(columnSizes, column, placement.columnSpan, columnGap);
    const placementHeight = gridPlacementTrackSize(rowSizes, row, placement.rowSpan, rowGap);
    const innerWidth = Math.max(0, placementWidth - margin.left - margin.right);
    const innerHeight = Math.max(0, placementHeight - margin.top - margin.bottom);

    if (layoutItem.width_sizing === "fill") {
      child.size.width = clampSize(innerWidth);
    }
    if (layoutItem.height_sizing === "fill" || layout.align_items === "stretch") {
      child.size.height = clampSize(innerHeight);
    }

    child.transform = {
      ...child.transform,
      x: layout.padding.left + columnStarts[column] + margin.left + gridAxisOffset(layout.justify_content, innerWidth, child.size.width),
      y: layout.padding.top + rowStarts[row] + margin.top + gridAxisOffset(layout.align_items, innerHeight, child.size.height)
    };
  });
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
  const mainGap = mainAxisGap(layout, isVertical);
  applyFillSizingForSingleLine(node, layout, flowChildren, isVertical, mainGap);
  const childMetrics = flowChildren.map((child) => childLayoutMetrics(child, isVertical));
  const totalChildMain =
    childMetrics.reduce(
      (total, metrics) => total + metrics.mainBefore + metrics.mainSize + metrics.mainAfter,
      0
    ) + mainGap * Math.max(0, childCount - 1);
  const totalChildCross = childMetrics.reduce(
    (maximum, metrics) => Math.max(maximum, metrics.crossBefore + metrics.crossSize + metrics.crossAfter),
    0
  );
  applyFitSizing(node, layout, isVertical, {
    main: mainStartPadding + totalChildMain + mainEndPadding,
    cross: crossStartPadding + totalChildCross + crossEndPadding
  });
  const availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  const availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
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
  let availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  let availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
  const mainGap = mainAxisGap(layout, isVertical);
  const crossGap = crossAxisGap(layout, isVertical);
  const lines = buildFlexLines(flowChildren, isVertical, availableMain, mainGap);
  applyFillSizingForWrappedLines(layout, lines, isVertical, availableMain);
  const totalLineMain = lines.reduce((maximum, line) => Math.max(maximum, line.mainSize), 0);
  const totalLineCross =
    lines.reduce((total, line) => total + line.crossSize, 0) + crossGap * Math.max(0, lines.length - 1);
  applyFitSizing(node, layout, isVertical, {
    main: mainStartPadding + totalLineMain + mainEndPadding,
    cross: crossStartPadding + totalLineCross + crossEndPadding
  });
  availableMain = Math.max(
    0,
    (isVertical ? node.size.height : node.size.width) - mainStartPadding - mainEndPadding
  );
  availableCross = Math.max(
    0,
    (isVertical ? node.size.width : node.size.height) - crossStartPadding - crossEndPadding
  );
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

function applyFillSizingForSingleLine(
  node: DesignNode,
  layout: NodeLayout,
  flowChildren: DesignNode[],
  isVertical: boolean,
  mainGap: number
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
  const mainAxisIsFixed = isVertical ? layout.height_sizing !== "fit" : layout.width_sizing !== "fit";
  const crossAxisIsFixed = isVertical ? layout.width_sizing !== "fit" : layout.height_sizing !== "fit";
  const childMetrics = flowChildren.map((child) => childLayoutMetrics(child, isVertical));
  const fillMainChildren = flowChildren.filter((child) => layoutItemMainSizing(child, isVertical) === "fill");

  if (mainAxisIsFixed && fillMainChildren.length > 0) {
    const fixedMainTotal = flowChildren.reduce((total, child, index) => {
      const metrics = childMetrics[index];
      const base = metrics.mainBefore + metrics.mainAfter;
      return total + base + (layoutItemMainSizing(child, isVertical) === "fill" ? 0 : metrics.mainSize);
    }, 0);
    const remainingMain = Math.max(0, availableMain - fixedMainTotal - mainGap * Math.max(0, flowChildren.length - 1));
    const filledMainSize = clampSize(remainingMain / fillMainChildren.length);
    for (const child of fillMainChildren) {
      if (isVertical) {
        child.size.height = filledMainSize;
      } else {
        child.size.width = filledMainSize;
      }
    }
  }

  if (crossAxisIsFixed) {
    flowChildren.forEach((child, index) => {
      if (layoutItemCrossSizing(child, isVertical) !== "fill") {
        return;
      }
      const metrics = childMetrics[index];
      const filledCrossSize = clampSize(availableCross - metrics.crossBefore - metrics.crossAfter);
      if (isVertical) {
        child.size.width = filledCrossSize;
      } else {
        child.size.height = filledCrossSize;
      }
    });
  }
}

function applyFillSizingForWrappedLines(
  layout: NodeLayout,
  lines: Array<{
    children: Array<{ child: DesignNode; metrics: ReturnType<typeof childLayoutMetrics> }>;
    mainSize: number;
    crossSize: number;
  }>,
  isVertical: boolean,
  availableMain: number
): void {
  const mainAxisIsFixed = isVertical ? layout.height_sizing !== "fit" : layout.width_sizing !== "fit";
  const crossAxisIsFixed = isVertical ? layout.width_sizing !== "fit" : layout.height_sizing !== "fit";

  for (const line of lines) {
    const fillMainChildren = line.children.filter((entry) => layoutItemMainSizing(entry.child, isVertical) === "fill");
    if (mainAxisIsFixed && fillMainChildren.length > 0) {
      const fixedMainTotal = line.children.reduce((total, entry) => {
        const base = entry.metrics.mainBefore + entry.metrics.mainAfter;
        return total + base + (layoutItemMainSizing(entry.child, isVertical) === "fill" ? 0 : entry.metrics.mainSize);
      }, 0);
      const remainingMain = Math.max(0, availableMain - fixedMainTotal - mainAxisGap(layout, isVertical) * Math.max(0, line.children.length - 1));
      const filledMainSize = clampSize(remainingMain / fillMainChildren.length);
      for (const entry of fillMainChildren) {
        if (isVertical) {
          entry.child.size.height = filledMainSize;
        } else {
          entry.child.size.width = filledMainSize;
        }
      }
    }

    line.children = line.children.map((entry) => ({
      child: entry.child,
      metrics: childLayoutMetrics(entry.child, isVertical)
    }));
    line.mainSize = line.children.reduce(
      (total, entry, index) =>
        total + entry.metrics.mainBefore + entry.metrics.mainSize + entry.metrics.mainAfter +
        (index > 0 ? mainAxisGap(layout, isVertical) : 0),
      0
    );
    line.crossSize = line.children.reduce(
      (maximum, entry) => Math.max(maximum, entry.metrics.crossBefore + entry.metrics.crossSize + entry.metrics.crossAfter),
      0
    );

    if (crossAxisIsFixed) {
      for (const entry of line.children) {
        if (layoutItemCrossSizing(entry.child, isVertical) !== "fill") {
          continue;
        }
        const filledCrossSize = clampSize(line.crossSize - entry.metrics.crossBefore - entry.metrics.crossAfter);
        if (isVertical) {
          entry.child.size.width = filledCrossSize;
        } else {
          entry.child.size.height = filledCrossSize;
        }
      }
      line.children = line.children.map((entry) => ({
        child: entry.child,
        metrics: childLayoutMetrics(entry.child, isVertical)
      }));
      line.crossSize = line.children.reduce(
        (maximum, entry) => Math.max(maximum, entry.metrics.crossBefore + entry.metrics.crossSize + entry.metrics.crossAfter),
        0
      );
    }
  }
}

function applyFitSizing(
  node: DesignNode,
  layout: NodeLayout,
  isVertical: boolean,
  contentSize: { main: number; cross: number }
): void {
  const fittedMain = clampSize(contentSize.main);
  const fittedCross = clampSize(contentSize.cross);
  if (isVertical) {
    if (layout.width_sizing === "fit") {
      node.size.width = fittedCross;
    }
    if (layout.height_sizing === "fit") {
      node.size.height = fittedMain;
    }
    return;
  }

  if (layout.width_sizing === "fit") {
    node.size.width = fittedMain;
  }
  if (layout.height_sizing === "fit") {
    node.size.height = fittedCross;
  }
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
  if (normalizedFlowLayout(parent.layout)) {
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
  const mode = layout.mode === "grid" ? "grid" : layout.mode === "auto" ? "auto" : "none";
  const wrap = isLayoutWrap(layout.wrap) ? layout.wrap : "nowrap";
  const alignContent = isLayoutAlignContent(layout.align_content) ? layout.align_content : "start";
  const widthSizing = isLayoutSizing(layout.width_sizing) ? layout.width_sizing : "fixed";
  const heightSizing = isLayoutSizing(layout.height_sizing) ? layout.height_sizing : "fixed";
  const gap = Math.max(0, finiteNumber(layout.gap, 0));
  const rowGap = Math.max(0, finiteNumber(layout.row_gap, gap));
  const columnGap = Math.max(0, finiteNumber(layout.column_gap, gap));
  const gridColumns = gridTrackCount(layout.grid_column_tracks, layout.grid_columns, 2);
  const gridRows = gridTrackCount(layout.grid_row_tracks, layout.grid_rows, 1);
  const gridColumnTracks = normalizeOptionalGridTracks(layout.grid_column_tracks, gridColumns);
  const gridRowTracks = normalizeOptionalGridTracks(layout.grid_row_tracks, gridRows);
  const gridAreas = normalizeOptionalGridAreas(layout.grid_areas, gridColumns, gridRows);
  return {
    mode,
    direction: layout.direction === "horizontal" ? "horizontal" : "vertical",
    ...(wrap === "wrap" ? { wrap } : {}),
    align_items: isLayoutAlignItems(layout.align_items) ? layout.align_items : "start",
    justify_content: isLayoutJustifyContent(layout.justify_content) ? layout.justify_content : "start",
    ...(wrap === "wrap" || alignContent !== "start" ? { align_content: alignContent } : {}),
    ...(widthSizing === "fit" ? { width_sizing: widthSizing } : {}),
    ...(heightSizing === "fit" ? { height_sizing: heightSizing } : {}),
    gap,
    ...(rowGap !== gap ? { row_gap: rowGap } : {}),
    ...(columnGap !== gap ? { column_gap: columnGap } : {}),
    ...(mode === "grid"
      ? {
          grid_columns: gridColumns,
          grid_rows: gridRows,
          ...(gridColumnTracks ? { grid_column_tracks: gridColumnTracks } : {}),
          ...(gridRowTracks ? { grid_row_tracks: gridRowTracks } : {}),
          ...(gridAreas ? { grid_areas: gridAreas } : {})
        }
      : {}),
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
  const widthSizing = isLayoutItemSizing(layoutItem.width_sizing) ? layoutItem.width_sizing : "fixed";
  const heightSizing = isLayoutItemSizing(layoutItem.height_sizing) ? layoutItem.height_sizing : "fixed";
  const gridColumn = normalizeGridPlacement(layoutItem.grid_column);
  const gridRow = normalizeGridPlacement(layoutItem.grid_row);
  const gridColumnSpan = normalizeGridSpan(layoutItem.grid_column_span);
  const gridRowSpan = normalizeGridSpan(layoutItem.grid_row_span);
  const gridArea = normalizeGridAreaName(layoutItem.grid_area);
  return {
    ...(position === "absolute" ? { position } : {}),
    ...(widthSizing === "fill" ? { width_sizing: widthSizing } : {}),
    ...(heightSizing === "fill" ? { height_sizing: heightSizing } : {}),
    ...(gridArea ? { grid_area: gridArea } : {}),
    ...(gridColumn !== undefined ? { grid_column: gridColumn } : {}),
    ...(gridRow !== undefined ? { grid_row: gridRow } : {}),
    ...(gridColumnSpan !== undefined ? { grid_column_span: gridColumnSpan } : {}),
    ...(gridRowSpan !== undefined ? { grid_row_span: gridRowSpan } : {}),
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

function normalizedFlowLayout(layout: NodeLayout | null | undefined): NodeLayout | null {
  if (!layout || (layout.mode !== "auto" && layout.mode !== "grid")) {
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

function normalizeGridTrackCount(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.round(finiteNumber(value, fallback)));
}

function gridTrackCount(tracks: GridTrack[] | undefined, explicitCount: number | undefined, fallback: number): number {
  return normalizeGridTrackCount(explicitCount, tracks?.length ?? fallback);
}

function normalizeOptionalGridTracks(tracks: GridTrack[] | undefined, count: number): GridTrack[] | undefined {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return undefined;
  }
  return Array.from({ length: count }, (_, index) => normalizeGridTrack(tracks[index]));
}

function normalizeOptionalGridAreas(areas: GridArea[] | undefined, columns: number, rows: number): GridArea[] | undefined {
  if (!Array.isArray(areas) || areas.length === 0) {
    return undefined;
  }
  const normalizedAreas = areas
    .map((area) => normalizeGridArea(area, columns, rows))
    .filter((area): area is GridArea => area !== null);
  return normalizedAreas.length > 0 ? normalizedAreas : undefined;
}

function normalizeGridArea(area: GridArea | undefined, columns: number, rows: number): GridArea | null {
  const name = normalizeGridAreaName(area?.name);
  if (!name) {
    return null;
  }
  const column = normalizeGridPlacementLine(area?.column, columns, 1);
  const row = normalizeGridPlacementLine(area?.row, rows, 1);
  return {
    name,
    column,
    row,
    column_span: gridPlacementSpan(normalizeGridSpan(area?.column_span), columns - (column - 1)),
    row_span: gridPlacementSpan(normalizeGridSpan(area?.row_span), rows - (row - 1))
  };
}

function resolveGridTracks(tracks: GridTrack[] | undefined, count: number): GridTrack[] {
  return Array.from({ length: count }, (_, index) => normalizeGridTrack(tracks?.[index]));
}

function normalizeGridTrack(track: GridTrack | undefined): GridTrack {
  if (track?.type === "px") {
    return { type: "px", value: Math.max(0, finiteNumber(track.value, 0)) };
  }
  if (track?.type === "auto") {
    return { type: "auto" };
  }
  return { type: "fr", value: Math.max(0.0001, finiteNumber(track?.value, 1)) };
}

function resolveGridTrackSizes(
  tracks: GridTrack[],
  availableSize: number,
  axis: "column" | "row",
  flowChildren: DesignNode[],
  placements: Map<string, GridPlacement>
): number[] {
  const sizes = tracks.map((track, index) =>
    track.type === "px" ? track.value ?? 0 : track.type === "auto" ? autoGridTrackSize(index, axis, flowChildren, placements) : 0
  );
  const fixedSize = sizes.reduce((total, size) => total + size, 0);
  const frTotal = tracks.reduce((total, track) => total + (track.type === "fr" ? track.value ?? 1 : 0), 0);
  const remainingSize = Math.max(0, availableSize - fixedSize);
  return sizes.map((size, index) =>
    tracks[index].type === "fr" && frTotal > 0 ? remainingSize * ((tracks[index].value ?? 1) / frTotal) : size
  );
}

function autoGridTrackSize(
  index: number,
  axis: "column" | "row",
  flowChildren: DesignNode[],
  placements: Map<string, GridPlacement>
): number {
  return flowChildren.reduce((maximum, child) => {
    const placement = placements.get(child.id);
    if (!placement) {
      return maximum;
    }
    const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
    if (axis === "column" && placement.column === index && placement.columnSpan === 1) {
      return Math.max(maximum, child.size.width + layoutItem.margin.left + layoutItem.margin.right);
    }
    if (axis === "row" && placement.row === index && placement.rowSpan === 1) {
      return Math.max(maximum, child.size.height + layoutItem.margin.top + layoutItem.margin.bottom);
    }
    return maximum;
  }, 0);
}

function gridTrackStarts(trackSizes: number[], gap: number): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const size of trackSizes) {
    starts.push(cursor);
    cursor += size + gap;
  }
  return starts;
}

function gridPlacementTrackSize(trackSizes: number[], start: number, span: number, gap: number): number {
  const tracks = trackSizes.slice(start, start + span);
  return tracks.reduce((total, size) => total + size, 0) + gap * Math.max(0, tracks.length - 1);
}

function normalizeGridPlacement(value: number | undefined): number | undefined {
  const normalized = finiteNumber(value, Number.NaN);
  return Number.isFinite(normalized) ? Math.max(1, Math.round(normalized)) : undefined;
}

function normalizeGridSpan(value: number | undefined): number | undefined {
  const normalized = finiteNumber(value, Number.NaN);
  return Number.isFinite(normalized) ? Math.max(1, Math.round(normalized)) : undefined;
}

function normalizeGridAreaName(value: string | undefined): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 ? name : undefined;
}

function normalizeGridPlacementLine(value: number | undefined, max: number, fallback: number): number {
  return Math.min(normalizeGridPlacement(value) ?? fallback, Math.max(1, max));
}

function namedGridAreaPlacement(
  layoutItem: NodeLayoutItem,
  areaPlacements: Map<string, GridPlacement>
): GridPlacement | null {
  const name = normalizeGridAreaName(layoutItem.grid_area);
  return name ? areaPlacements.get(name) ?? null : null;
}

function gridAreaPlacementsByName(
  areas: GridArea[] | undefined,
  columns: number,
  rows: number
): Map<string, GridPlacement> {
  const placements = new Map<string, GridPlacement>();
  for (const area of normalizeOptionalGridAreas(areas, columns, rows) ?? []) {
    if (!placements.has(area.name)) {
      placements.set(area.name, {
        column: area.column - 1,
        row: area.row - 1,
        columnSpan: area.column_span,
        rowSpan: area.row_span
      });
    }
  }
  return placements;
}

function manualGridPlacement(layoutItem: NodeLayoutItem, columns: number, rows: number): GridPlacement | null {
  const columnSpan = normalizeGridSpan(layoutItem.grid_column_span);
  const rowSpan = normalizeGridSpan(layoutItem.grid_row_span);
  if (
    layoutItem.grid_column === undefined &&
    layoutItem.grid_row === undefined &&
    columnSpan === undefined &&
    rowSpan === undefined
  ) {
    return null;
  }
  const column = gridPlacementIndex(layoutItem.grid_column, columns, 1);
  const row = gridPlacementIndex(layoutItem.grid_row, rows, 1);
  return {
    column,
    row,
    columnSpan: gridPlacementSpan(columnSpan, columns - column),
    rowSpan: gridPlacementSpan(rowSpan, rows - row)
  };
}

function gridPlacementSpan(value: number | undefined, remainingTracks: number): number {
  return Math.min(value ?? 1, Math.max(1, remainingTracks));
}

function gridPlacementCells(placement: GridPlacement): GridCell[] {
  return Array.from({ length: placement.rowSpan }, (_, rowOffset) =>
    Array.from({ length: placement.columnSpan }, (__, columnOffset) => ({
      row: placement.row + rowOffset,
      column: placement.column + columnOffset
    }))
  ).flat();
}

function gridPlacementIndex(value: number | undefined, max: number, fallback: number): number {
  const line = normalizeGridPlacement(value) ?? fallback;
  return Math.min(Math.max(0, line - 1), Math.max(0, max - 1));
}

function nextAutoGridCell(
  startCursor: number,
  columns: number,
  rows: number,
  occupiedCells: Set<string>,
  direction: NodeLayout["direction"]
): GridAutoCell {
  const capacity = Math.max(1, columns * rows);
  for (let cursor = startCursor; cursor < capacity; cursor += 1) {
    const cell = gridCellAt(cursor, columns, rows, direction);
    if (cell && !occupiedCells.has(gridCellKey(cell))) {
      return { ...cell, nextCursor: cursor + 1 };
    }
  }
  return { row: Math.max(0, rows - 1), column: Math.max(0, columns - 1), nextCursor: capacity };
}

function gridCellAt(index: number, columns: number, rows: number, direction: NodeLayout["direction"]): GridCell | null {
  const row = direction === "vertical" ? index % rows : Math.floor(index / columns);
  const column = direction === "vertical" ? Math.floor(index / rows) : index % columns;
  return row < rows && column < columns ? { row, column } : null;
}

function gridCellKey(cell: GridCell): string {
  return `${cell.row}:${cell.column}`;
}

function gridAxisOffset(
  alignment: NodeLayout["align_items"] | NodeLayout["justify_content"],
  available: number,
  size: number
): number {
  const remaining = Math.max(0, available - size);
  if (alignment === "center") {
    return remaining / 2;
  }
  if (alignment === "end") {
    return remaining;
  }
  return 0;
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

function isLayoutSizing(value: string | undefined): value is NonNullable<NodeLayout["width_sizing"]> {
  return value === "fixed" || value === "fit";
}

function isLayoutItemSizing(value: string | undefined): value is NonNullable<NodeLayoutItem["width_sizing"]> {
  return value === "fixed" || value === "fill";
}

function layoutItemMainSizing(child: { layout_item?: NodeLayoutItem | null }, isVertical: boolean): "fixed" | "fill" {
  const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
  return isVertical ? layoutItem.height_sizing ?? "fixed" : layoutItem.width_sizing ?? "fixed";
}

function layoutItemCrossSizing(child: { layout_item?: NodeLayoutItem | null }, isVertical: boolean): "fixed" | "fill" {
  const layoutItem = normalizeNodeLayoutItem(child.layout_item ?? DEFAULT_LAYOUT_ITEM);
  return isVertical ? layoutItem.width_sizing ?? "fixed" : layoutItem.height_sizing ?? "fixed";
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
