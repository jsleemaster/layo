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

  const bounds = result.bounds;
  const evaluation = {
    pathData: result.pathData,
    area: Math.abs(result.area),
    bounds: {
      x: normalizeNumber(bounds.x),
      y: normalizeNumber(bounds.y),
      width: normalizeNumber(bounds.width),
      height: normalizeNumber(bounds.height)
    }
  };
  scope.project.clear();
  return evaluation;
}

function normalizeNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
