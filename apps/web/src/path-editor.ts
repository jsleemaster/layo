export type EditablePathCommand =
  | { type: "M" | "L"; x: number; y: number }
  | {
      type: "C";
      control1: EditablePathPoint;
      control2: EditablePathPoint;
      x: number;
      y: number;
    }
  | { type: "Q"; control: EditablePathPoint; x: number; y: number }
  | { type: "Z" };

export interface EditablePathPoint {
  x: number;
  y: number;
}

export interface EditablePath {
  commands: EditablePathCommand[];
  closed: boolean;
}

export interface EditablePathAnchor extends EditablePathPoint {
  anchorIndex: number;
  commandIndex: number;
}

export interface EditablePathControl extends EditablePathPoint {
  commandIndex: number;
  role: "control1" | "control2" | "control";
}

const pathTokenPattern = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const editableCommands = new Set(["M", "L", "H", "V", "C", "Q", "Z"]);

export function parseEditablePath(pathData: string): EditablePath | null {
  const tokens = pathData.match(pathTokenPattern) ?? [];
  const commands: EditablePathCommand[] = [];
  let index = 0;
  let activeCommand = "";
  let current: EditablePathPoint = { x: 0, y: 0 };
  let subpathStart: EditablePathPoint = { x: 0, y: 0 };

  const readNumber = () => {
    const token = tokens[index];
    if (token === undefined || /^[a-zA-Z]$/.test(token)) {
      return null;
    }
    index += 1;
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };

  const readPoint = (relative: boolean): EditablePathPoint | null => {
    const x = readNumber();
    const y = readNumber();
    if (x === null || y === null) {
      return null;
    }
    return {
      x: relative ? current.x + x : x,
      y: relative ? current.y + y : y
    };
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-zA-Z]$/.test(token)) {
      activeCommand = token;
      index += 1;
      if (!editableCommands.has(activeCommand.toUpperCase())) {
        return null;
      }
    }
    if (!activeCommand) {
      return null;
    }

    const upper = activeCommand.toUpperCase();
    const relative = activeCommand !== upper;
    if (upper === "Z") {
      commands.push({ type: "Z" });
      current = { ...subpathStart };
      activeCommand = "";
      continue;
    }

    if (upper === "M" || upper === "L") {
      const point = readPoint(relative);
      if (!point) {
        return null;
      }
      const type = upper === "M" ? "M" : "L";
      commands.push({ type, ...point });
      current = point;
      if (type === "M") {
        subpathStart = { ...point };
        activeCommand = relative ? "l" : "L";
      }
      continue;
    }

    if (upper === "H") {
      const rawX = readNumber();
      if (rawX === null) {
        return null;
      }
      current = { x: relative ? current.x + rawX : rawX, y: current.y };
      commands.push({ type: "L", ...current });
      continue;
    }

    if (upper === "V") {
      const rawY = readNumber();
      if (rawY === null) {
        return null;
      }
      current = { x: current.x, y: relative ? current.y + rawY : rawY };
      commands.push({ type: "L", ...current });
      continue;
    }

    if (upper === "C") {
      const control1 = readPoint(relative);
      const control2 = readPoint(relative);
      const point = readPoint(relative);
      if (!control1 || !control2 || !point) {
        return null;
      }
      commands.push({ type: "C", control1, control2, ...point });
      current = point;
      continue;
    }

    if (upper === "Q") {
      const control = readPoint(relative);
      const point = readPoint(relative);
      if (!control || !point) {
        return null;
      }
      commands.push({ type: "Q", control, ...point });
      current = point;
      continue;
    }

    return null;
  }

  if (!commands.length || commands[0]?.type !== "M") {
    return null;
  }

  return {
    commands,
    closed: commands.some((command) => command.type === "Z")
  };
}

export function pathHasOnlyClosedSubpaths(pathData: string) {
  const path = parseEditablePath(pathData);
  if (!path) {
    return false;
  }

  let subpathCount = 0;
  let activeSubpathClosed = true;
  for (const command of path.commands) {
    if (command.type === "M") {
      if (subpathCount > 0 && !activeSubpathClosed) {
        return false;
      }
      subpathCount += 1;
      activeSubpathClosed = false;
    } else if (command.type === "Z") {
      activeSubpathClosed = true;
    }
  }
  return subpathCount > 0 && activeSubpathClosed;
}

export function editablePathAnchors(path: EditablePath): EditablePathAnchor[] {
  const anchors: EditablePathAnchor[] = [];
  path.commands.forEach((command, commandIndex) => {
    if (command.type === "Z") {
      return;
    }
    anchors.push({
      anchorIndex: anchors.length,
      commandIndex,
      x: command.x,
      y: command.y
    });
  });
  return anchors;
}

export function editablePathControls(path: EditablePath): EditablePathControl[] {
  return path.commands.flatMap<EditablePathControl>((command, commandIndex) => {
    if (command.type === "C") {
      return [
        { commandIndex, role: "control1" as const, ...command.control1 },
        { commandIndex, role: "control2" as const, ...command.control2 }
      ];
    }
    if (command.type === "Q") {
      return [{ commandIndex, role: "control" as const, ...command.control }];
    }
    return [];
  });
}

export function insertEditablePathAnchor(
  path: EditablePath,
  afterAnchorIndex: number
): EditablePath {
  const anchors = editablePathAnchors(path);
  const anchor = anchors[afterAnchorIndex];
  const nextAnchor = anchors[afterAnchorIndex + 1];
  if (!anchor || !nextAnchor) {
    return path;
  }

  const nextCommand = path.commands[nextAnchor.commandIndex];
  if (!nextCommand || nextCommand.type === "M" || nextCommand.type === "Z") {
    return path;
  }

  const midpoint = (start: EditablePathPoint, end: EditablePathPoint) => ({
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  });
  const commands = structuredClone(path.commands);
  if (nextCommand.type === "L") {
    commands.splice(nextAnchor.commandIndex, 0, {
      type: "L",
      ...midpoint(anchor, nextAnchor)
    });
  } else if (nextCommand.type === "C") {
    const startToControl = midpoint(anchor, nextCommand.control1);
    const controlsMidpoint = midpoint(nextCommand.control1, nextCommand.control2);
    const controlToEnd = midpoint(nextCommand.control2, nextAnchor);
    const firstControl2 = midpoint(startToControl, controlsMidpoint);
    const secondControl1 = midpoint(controlsMidpoint, controlToEnd);
    const splitPoint = midpoint(firstControl2, secondControl1);
    commands.splice(
      nextAnchor.commandIndex,
      1,
      {
        type: "C",
        control1: startToControl,
        control2: firstControl2,
        ...splitPoint
      },
      {
        type: "C",
        control1: secondControl1,
        control2: controlToEnd,
        x: nextAnchor.x,
        y: nextAnchor.y
      }
    );
  } else if (nextCommand.type === "Q") {
    const startToControl = midpoint(anchor, nextCommand.control);
    const controlToEnd = midpoint(nextCommand.control, nextAnchor);
    const splitPoint = midpoint(startToControl, controlToEnd);
    commands.splice(
      nextAnchor.commandIndex,
      1,
      {
        type: "Q",
        control: startToControl,
        ...splitPoint
      },
      {
        type: "Q",
        control: controlToEnd,
        x: nextAnchor.x,
        y: nextAnchor.y
      }
    );
  } else {
    return path;
  }
  return { commands, closed: path.closed };
}

export function deleteEditablePathAnchor(
  path: EditablePath,
  anchorIndex: number
): EditablePath {
  const anchors = editablePathAnchors(path);
  if (anchors.length <= 2) {
    return path;
  }

  const anchor = anchors[anchorIndex];
  if (!anchor) {
    return path;
  }

  const commands = structuredClone(path.commands);
  const removed = commands.splice(anchor.commandIndex, 1)[0];
  if (removed?.type === "M") {
    const next = commands[anchor.commandIndex];
    if (next && next.type !== "Z") {
      commands[anchor.commandIndex] = { type: "M", x: next.x, y: next.y };
    }
  }
  return { commands, closed: commands.some((command) => command.type === "Z") };
}

export function convertEditablePathAnchor(
  path: EditablePath,
  anchorIndex: number,
  mode: "corner" | "curve"
): EditablePath {
  const anchors = editablePathAnchors(path);
  const anchor = anchors[anchorIndex];
  const previous = anchors[anchorIndex - 1];
  if (!anchor || !previous) {
    return path;
  }

  const command = path.commands[anchor.commandIndex];
  if (!command || command.type === "M" || command.type === "Z") {
    return path;
  }

  const commands = structuredClone(path.commands);
  if (mode === "corner") {
    commands[anchor.commandIndex] = { type: "L", x: anchor.x, y: anchor.y };
  } else if (command.type === "L") {
    commands[anchor.commandIndex] = {
      type: "C",
      control1: {
        x: previous.x + (anchor.x - previous.x) / 3,
        y: previous.y + (anchor.y - previous.y) / 3
      },
      control2: {
        x: previous.x + ((anchor.x - previous.x) * 2) / 3,
        y: previous.y + ((anchor.y - previous.y) * 2) / 3
      },
      x: anchor.x,
      y: anchor.y
    };
  } else {
    return path;
  }
  return { commands, closed: path.closed };
}

export function separateEditablePathAtAnchor(
  path: EditablePath,
  anchorIndex: number
): EditablePath {
  const anchor = editablePathAnchors(path)[anchorIndex];
  if (!anchor || anchor.commandIndex === 0) {
    return path;
  }

  const command = path.commands[anchor.commandIndex];
  if (!command || command.type === "M" || command.type === "Z") {
    return path;
  }

  const commands = structuredClone(path.commands);
  commands[anchor.commandIndex] = { type: "M", x: anchor.x, y: anchor.y };
  return { commands, closed: commands.some((candidate) => candidate.type === "Z") };
}

export function joinEditablePathSubpaths(path: EditablePath): EditablePath {
  let sawInitialMove = false;
  const commands = path.commands.map((command) => {
    if (command.type !== "M") {
      return structuredClone(command);
    }
    if (!sawInitialMove) {
      sawInitialMove = true;
      return structuredClone(command);
    }
    return { type: "L" as const, x: command.x, y: command.y };
  });
  return { commands, closed: path.closed };
}

export function mergeEditablePathAnchors(
  path: EditablePath,
  firstAnchorIndex: number,
  secondAnchorIndex: number
): EditablePath {
  if (firstAnchorIndex === secondAnchorIndex) {
    return path;
  }

  const anchors = editablePathAnchors(path);
  const first = anchors[firstAnchorIndex];
  const second = anchors[secondAnchorIndex];
  if (!first || !second) {
    return path;
  }

  const keepIndex = Math.min(firstAnchorIndex, secondAnchorIndex);
  const removeIndex = Math.max(firstAnchorIndex, secondAnchorIndex);
  const moved = moveEditablePathAnchor(path, keepIndex, {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  });
  return deleteEditablePathAnchor(moved, removeIndex);
}

export function moveEditablePathAnchor(
  path: EditablePath,
  anchorIndex: number,
  point: EditablePathPoint
): EditablePath {
  const commands = structuredClone(path.commands);
  const anchor = editablePathAnchors({ ...path, commands })[anchorIndex];
  if (!anchor) {
    return path;
  }
  const command = commands[anchor.commandIndex];
  if (!command || command.type === "Z") {
    return path;
  }

  const dx = point.x - command.x;
  const dy = point.y - command.y;
  command.x = point.x;
  command.y = point.y;
  if (command.type === "C") {
    command.control2.x += dx;
    command.control2.y += dy;
  } else if (command.type === "Q") {
    command.control.x += dx;
    command.control.y += dy;
  }

  const next = commands[anchor.commandIndex + 1];
  if (next?.type === "C") {
    next.control1.x += dx;
    next.control1.y += dy;
  }

  return { commands, closed: path.closed };
}

export function moveEditablePathControl(
  path: EditablePath,
  control: Pick<EditablePathControl, "commandIndex" | "role">,
  point: EditablePathPoint
): EditablePath {
  const commands = structuredClone(path.commands);
  const command = commands[control.commandIndex];
  if (command?.type === "C" && (control.role === "control1" || control.role === "control2")) {
    command[control.role] = { ...point };
    return { commands, closed: path.closed };
  }
  if (command?.type === "Q" && control.role === "control") {
    command.control = { ...point };
    return { commands, closed: path.closed };
  }
  return path;
}

export function serializeEditablePath(path: EditablePath): string {
  return path.commands
    .map((command) => {
      if (command.type === "Z") {
        return "Z";
      }
      if (command.type === "M" || command.type === "L") {
        return `${command.type}${formatPathNumber(command.x)} ${formatPathNumber(command.y)}`;
      }
      if (command.type === "C") {
        return `C${formatPathPoint(command.control1)} ${formatPathPoint(command.control2)} ${formatPathNumber(command.x)} ${formatPathNumber(command.y)}`;
      }
      if (command.type === "Q") {
        return `Q${formatPathPoint(command.control)} ${formatPathNumber(command.x)} ${formatPathNumber(command.y)}`;
      }
      return "";
    })
    .join(" ");
}

function formatPathPoint(point: EditablePathPoint) {
  return `${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`;
}

function formatPathNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
