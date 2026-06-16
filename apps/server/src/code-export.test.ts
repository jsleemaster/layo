import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { exportDesignToCode } from "./code-export";
import { FileStorage, type DesignFile, type DesignNode } from "./storage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("code export", () => {
  test("exports canvas nodes as CSS and HTML", () => {
    const result = exportDesignToCode(tossFixture());

    expect(result.css).toContain(".canvas-export-root");
    expect(result.css).toContain(".node-tds-button-primary");
    expect(result.css).toContain("background-color: #3182f6;");
    expect(result.html).toContain('data-node-id="tds-button-primary"');
    expect(result.html).toContain("송금하기");
    expect(result.elements.map((element) => element.id)).toEqual([
      "tds-button-primary",
      "tds-transfer-card"
    ]);
  });

  test("exports separate element modules that can be imported directly", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-code-export-"));
    const result = exportDesignToCode(tossFixture(), { moduleBasePath: "./elements" });
    const elementsDir = path.join(tempRoot, "elements");
    await mkdir(elementsDir, { recursive: true });

    await Promise.all(
      result.elements.map(async (element) => {
        await writeFile(path.join(elementsDir, `${element.id}.mjs`), element.jsModule, "utf8");
      })
    );
    await writeFile(path.join(tempRoot, "index.mjs"), result.indexModule, "utf8");

    const button = await import(pathToFileURL(path.join(elementsDir, "tds-button-primary.mjs")).href);
    const index = await import(pathToFileURL(path.join(tempRoot, "index.mjs")).href);

    expect(button.default.id).toBe("tds-button-primary");
    expect(button.default.html).toContain("송금하기");
    expect(button.default.css).toContain(".node-tds-button-primary");
    expect(index.elements.map((element: { id: string }) => element.id)).toEqual([
      "tds-button-primary",
      "tds-transfer-card"
    ]);
  });

  test("storage exports code artifacts for a design file", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "canvas-code-export-storage-"));
    const storage = new FileStorage(tempRoot);

    await storage.writeFile("toss-file", tossFixture());
    const result = await storage.exportCode("toss-file");

    expect(result.elements).toHaveLength(2);
    expect(result.elements[1]).toMatchObject({
      id: "tds-transfer-card",
      className: "node-tds-transfer-card"
    });
    expect(result.indexModule).toContain("tds-button-primary.mjs");
  });
});

function frameNode(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: DesignNode["style"],
  children: DesignNode[]
): DesignNode {
  return {
    id,
    kind: "frame",
    name,
    transform: { x, y, rotation: 0 },
    size: { width, height },
    style,
    content: { type: "empty" },
    children
  };
}

function textNode(
  id: string,
  name: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  fontSize: number
): DesignNode {
  return {
    id,
    kind: "text",
    name,
    transform: { x, y, rotation: 0 },
    size: { width, height },
    style: { fill, stroke: null, stroke_width: 0, opacity: 1 },
    content: { type: "text", value, font_size: fontSize, font_family: "Arial" },
    children: []
  };
}

function tossFixture(): DesignFile {
  return {
    id: "toss-file",
    name: "Toss Components",
    version: 1,
    components: [],
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [
          frameNode(
            "tds-button-primary",
            "Toss / Button / Primary",
            64,
            120,
            240,
            56,
            { fill: "#3182f6", stroke: null, stroke_width: 0, opacity: 1 },
            [textNode("tds-button-label", "Label", "송금하기", 82, 16, 96, 24, "#ffffff", 18)]
          ),
          frameNode(
            "tds-transfer-card",
            "Toss / Card / Transfer",
            64,
            208,
            320,
            176,
            { fill: "#ffffff", stroke: "#e5e8eb", stroke_width: 1, opacity: 1 },
            [
              textNode("tds-transfer-bank", "Bank Label", "토스뱅크", 24, 24, 120, 22, "#6b7684", 15),
              textNode("tds-transfer-amount", "Amount", "1,250,000원", 24, 56, 240, 38, "#191f28", 30)
            ]
          )
        ]
      }
    ]
  };
}
