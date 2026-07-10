import { describe, expect, test } from "vitest";
import {
  editablePathAnchors,
  editablePathControls,
  moveEditablePathAnchor,
  moveEditablePathControl,
  parseEditablePath,
  serializeEditablePath
} from "./path-editor";

describe("editable path geometry", () => {
  test("normalizes M/L/H/V/C/Q/Z commands into editable absolute geometry", () => {
    const path = parseEditablePath(
      "M0 0 H100 V50 L25 75 C30 80 40 90 50 100 Q60 110 70 120 Z"
    );

    expect(path).not.toBeNull();
    expect(path?.closed).toBe(true);
    expect(path?.commands).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 100, y: 0 },
      { type: "L", x: 100, y: 50 },
      { type: "L", x: 25, y: 75 },
      {
        type: "C",
        control1: { x: 30, y: 80 },
        control2: { x: 40, y: 90 },
        x: 50,
        y: 100
      },
      { type: "Q", control: { x: 60, y: 110 }, x: 70, y: 120 },
      { type: "Z" }
    ]);
    expect(editablePathAnchors(path!)).toHaveLength(6);
    expect(editablePathControls(path!)).toHaveLength(3);
  });

  test("moves one anchor with attached cubic controls and serializes one stable path", () => {
    const path = parseEditablePath("M0 0 C10 0 20 10 30 10 C40 10 50 20 60 20 Z");
    expect(path).not.toBeNull();

    const moved = moveEditablePathAnchor(path!, 1, { x: 42, y: 18 });

    expect(moved.commands[1]).toEqual({
      type: "C",
      control1: { x: 10, y: 0 },
      control2: { x: 32, y: 18 },
      x: 42,
      y: 18
    });
    expect(moved.commands[2]).toMatchObject({
      type: "C",
      control1: { x: 52, y: 18 }
    });
    expect(serializeEditablePath(moved)).toBe(
      "M0 0 C10 0 32 18 42 18 C52 18 50 20 60 20 Z"
    );
  });

  test("moves cubic and quadratic controls without moving their anchors", () => {
    const path = parseEditablePath("M0 0 C10 0 20 10 30 10 Q40 20 50 20");
    expect(path).not.toBeNull();

    const cubicMoved = moveEditablePathControl(
      path!,
      { commandIndex: 1, role: "control2" },
      { x: 24, y: 14 }
    );
    const quadraticMoved = moveEditablePathControl(
      cubicMoved,
      { commandIndex: 2, role: "control" },
      { x: 44, y: 24 }
    );

    expect(quadraticMoved.commands[1]).toMatchObject({
      type: "C",
      control2: { x: 24, y: 14 },
      x: 30,
      y: 10
    });
    expect(quadraticMoved.commands[2]).toEqual({
      type: "Q",
      control: { x: 44, y: 24 },
      x: 50,
      y: 20
    });
  });

  test("preserves each move command when a path has multiple subpaths", () => {
    const path = parseEditablePath("M0 0 L20 0 Z M40 40 L60 40 Z");

    expect(path?.commands).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 20, y: 0 },
      { type: "Z" },
      { type: "M", x: 40, y: 40 },
      { type: "L", x: 60, y: 40 },
      { type: "Z" }
    ]);
    expect(serializeEditablePath(path!)).toBe("M0 0 L20 0 Z M40 40 L60 40 Z");
  });

  test("keeps unsupported arc and smooth commands read-only", () => {
    expect(parseEditablePath("M0 0 A10 10 0 0 1 20 20")).toBeNull();
    expect(parseEditablePath("M0 0 S10 10 20 20")).toBeNull();
    expect(parseEditablePath("M0 0 T20 20")).toBeNull();
  });
});
