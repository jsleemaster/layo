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
