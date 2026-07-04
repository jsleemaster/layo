import { describe, expect, test } from "vitest";
import { relayoutDesignFile } from "./layout";
import { sampleDocument } from "./sample-document";
import type { DesignFile } from "./storage";

describe("server layout", () => {
  test("last-baseline alignment matches final text baselines in horizontal auto layout", () => {
    const document = structuredClone(sampleDocument) as DesignFile;
    const frame = document.pages[0].children[0] as any;
    frame.size = { width: 360, height: 140 };
    frame.layout = {
      mode: "auto",
      direction: "horizontal",
      align_items: "last_baseline",
      justify_content: "start",
      gap: 10,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const title = frame.children[0];
    title.size = { width: 120, height: 72 };
    title.content = { type: "text", value: "Title", font_size: 32, font_family: "Inter" };
    frame.children.push({
      id: "caption-1",
      kind: "text",
      name: "캡션",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 24 },
      style: { fill: "#374151", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "text", value: "Caption", font_size: 16, font_family: "Inter" },
      children: []
    });

    relayoutDesignFile(document);

    const caption = frame.children.find((node: { id: string }) => node.id === "caption-1");
    expect(title.transform).toMatchObject({ x: 20, y: 20 });
    expect(caption?.transform).toMatchObject({ x: 150, y: 65 });
    expect(title.transform.y + 66).toBe((caption?.transform.y ?? 0) + 21);
  });

  test("grid layout last-baseline aligns mixed text per row", () => {
    const document = structuredClone(sampleDocument) as DesignFile;
    const frame = document.pages[0].children[0] as any;
    frame.size = { width: 300, height: 140 };
    frame.layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 1,
      align_items: "last_baseline",
      justify_content: "start",
      gap: 0,
      row_gap: 0,
      column_gap: 0,
      padding: { top: 20, right: 20, bottom: 20, left: 20 }
    };
    const title = frame.children[0];
    title.size = { width: 90, height: 72 };
    title.content = { type: "text", value: "Title", font_size: 32, font_family: "Inter" };
    frame.children.push({
      id: "caption-1",
      kind: "text",
      name: "캡션",
      transform: { x: 0, y: 0, rotation: 0 },
      size: { width: 80, height: 24 },
      style: { fill: "#374151", stroke: null, stroke_width: 0, opacity: 1 },
      content: { type: "text", value: "Caption", font_size: 16, font_family: "Inter" },
      children: []
    });

    relayoutDesignFile(document);

    const caption = frame.children.find((node: { id: string }) => node.id === "caption-1");
    expect(title.transform).toMatchObject({ x: 20, y: 20 });
    expect(caption?.transform).toMatchObject({ x: 150, y: 65 });
    expect(title.transform.y + 66).toBe((caption?.transform.y ?? 0) + 21);
  });
});
