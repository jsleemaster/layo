import paper from "paper";
import type { BooleanPathOperation } from "./index";

export interface BooleanPathOperand {
  pathData: string;
  transform: {
    x: number;
    y: number;
    rotation: number;
  };
}

export interface BooleanPathEvaluation {
  pathData: string;
  area: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function evaluateBooleanPath(
  operation: BooleanPathOperation,
  operands: BooleanPathOperand[]
): BooleanPathEvaluation {
  if (operands.length < 2) {
    throw new Error("boolean paths require at least two operands");
  }

  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  const items = operands.map((operand) => {
    const item = new scope.CompoundPath({
      pathData: operand.pathData,
      insert: false
    });
    if (item.isEmpty()) {
      throw new Error("boolean path operand must contain closed geometry");
    }
    if (operand.transform.rotation) {
      item.rotate(operand.transform.rotation, new scope.Point(0, 0));
    }
    item.translate(new scope.Point(operand.transform.x, operand.transform.y));
    return item;
  });

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
    area: filledPathArea(result, scope),
    bounds
  };
  scope.project.clear();
  return evaluation;
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
