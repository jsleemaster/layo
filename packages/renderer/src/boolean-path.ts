import paper from "paper";
import type { BooleanPathOperation } from "./index";

export interface BooleanPathOperand {
  pathData: string;
  fillRule?: "nonzero" | "evenodd";
  transform: {
    x: number;
    y: number;
    rotation: number;
  };
}

export interface BooleanPathEvaluation {
  pathData: string;
  fillRule: "nonzero";
  closed: boolean;
  area: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}


export function flattenPathGeometry(
  operands: BooleanPathOperand[]
): BooleanPathEvaluation {
  if (operands.length === 0) {
    throw new Error("path flattening requires at least one operand");
  }

  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  const result = new scope.CompoundPath({ insert: false });
  for (const operand of operands) {
    const item = createPathItem(scope, operand, "path flatten source", false);
    if (operand.fillRule === "evenodd" && item.children.every((path) => path instanceof scope.Path && path.closed)) {
      item.reorient(true, true);
    }
    result.addChildren(item.removeChildren());
    item.remove();
  }

  if (result.isEmpty()) {
    throw new Error("path flattening did not produce path geometry");
  }
  const bounds = {
    x: normalizeNumber(result.bounds.x),
    y: normalizeNumber(result.bounds.y),
    width: normalizeNumber(result.bounds.width),
    height: normalizeNumber(result.bounds.height)
  };
  result.translate(new scope.Point(-bounds.x, -bounds.y));
  result.fillRule = "nonzero";
  const evaluation = {
    pathData: result.pathData,
    fillRule: "nonzero" as const,
    closed: result.children.every((path) => path instanceof scope.Path && path.closed),
    area: filledPathArea(result, scope),
    bounds
  };
  scope.project.clear();
  return evaluation;
}

export function evaluateBooleanPath(
  operation: BooleanPathOperation,
  operands: BooleanPathOperand[]
): BooleanPathEvaluation {
  if (!["union", "difference", "intersection", "exclusion"].includes(operation)) {
    throw new Error(`unsupported boolean path operation: ${String(operation)}`);
  }
  if (operands.length < 2) {
    throw new Error("boolean paths require at least two operands");
  }

  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  const items = operands.map((operand) =>
    createPathItem(scope, operand, "boolean path operand", true)
  );

  let result: paper.PathItem = items[0];
  for (const operand of items.slice(1)) {
    const next =
      operation === "union"
        ? result.unite(operand, { insert: false, trace: true })
        : operation === "difference"
          ? result.subtract(operand, { insert: false, trace: true })
          : operation === "intersection"
            ? result.intersect(operand, { insert: false, trace: true })
            : result.exclude(operand, { insert: false, trace: true });
    if (result !== items[0]) {
      result.remove();
    }
    result = next;
  }

  if (!(result instanceof scope.Path) && !(result instanceof scope.CompoundPath)) {
    throw new Error("boolean path evaluation did not produce path geometry");
  }
  const bounds = {
    x: normalizeNumber(result.bounds.x),
    y: normalizeNumber(result.bounds.y),
    width: normalizeNumber(result.bounds.width),
    height: normalizeNumber(result.bounds.height)
  };
  result.translate(new scope.Point(-bounds.x, -bounds.y));
  const evaluation = {
    pathData: result.pathData,
    fillRule: "nonzero" as const,
    closed: true,
    area: filledPathArea(result, scope),
    bounds
  };
  scope.project.clear();
  return evaluation;
}


function createPathItem(
  scope: paper.PaperScope,
  operand: BooleanPathOperand,
  label: string,
  requireClosed: boolean
) {
  const item = new scope.CompoundPath({
    pathData: operand.pathData,
    insert: false
  });
  const paths = item.children.filter(
    (child): child is paper.Path => child instanceof scope.Path
  );
  if (item.isEmpty() || paths.length === 0 || (requireClosed && paths.some((path) => !path.closed))) {
    throw new Error(`${label} must contain closed geometry`);
  }
  item.fillRule = operand.fillRule === "evenodd" ? "evenodd" : "nonzero";
  if (operand.transform.rotation) {
    item.rotate(operand.transform.rotation, new scope.Point(0, 0));
  }
  item.translate(new scope.Point(operand.transform.x, operand.transform.y));
  return item;
}

function normalizeNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function filledPathArea(
  result: paper.Path | paper.CompoundPath,
  scope: paper.PaperScope
) {
  if (result instanceof scope.Path) {
    return Math.abs(result.area);
  }

  const paths = result.children.filter(
    (child): child is paper.Path => child instanceof scope.Path
  );
  return paths.reduce((area, path) => {
    const containmentDepth = paths.filter(
      (candidate) =>
        candidate !== path &&
        Math.abs(candidate.area) > Math.abs(path.area) &&
        candidate.contains(path.interiorPoint)
    ).length;
    const contribution = Math.abs(path.area);
    return area + (containmentDepth % 2 === 0 ? contribution : -contribution);
  }, 0);
}
