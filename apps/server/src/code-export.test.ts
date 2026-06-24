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

  test("exports codegen-ready element structure and implementation hints", () => {
    const result = exportDesignToCode(tossFixture());
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect(button?.structure).toMatchObject({
      id: "tds-button-primary",
      name: "Toss / Button / Primary",
      kind: "frame",
      className: "node-tds-button-primary",
      bounds: { x: 64, y: 120, width: 240, height: 56, rotation: 0 },
      style: { fill: "#3182f6", stroke: null, strokeWidth: 0, opacity: 1 },
      content: { type: "empty" },
      children: [
        {
          id: "tds-button-label",
          kind: "text",
          content: {
            type: "text",
            value: "송금하기",
            fontSize: 18,
            fontFamily: "Arial"
          }
        }
      ]
    });
    expect(button?.implementation).toMatchObject({
      componentName: "TdsButtonPrimary",
      suggestedProps: [
        {
          name: "label",
          type: "string",
          sourceNodeId: "tds-button-label",
          defaultValue: "송금하기"
        }
      ],
      cssClassNames: ["node-tds-button-primary", "node-tds-button-label"],
      sourceNodeIds: ["tds-button-primary", "tds-button-label"]
    });
    expect(result.implementationSpec.elements.map((element) => element.id)).toEqual([
      "tds-button-primary",
      "tds-transfer-card"
    ]);
    expect(result.implementationSpec.tokenCandidates.colors).toEqual([
      "#3182f6",
      "#ffffff",
      "#e5e8eb",
      "#6b7684",
      "#191f28"
    ]);
  });

  test("exports component definitions and instance references for agents", () => {
    const result = exportDesignToCode(componentFixture());

    expect(result.implementationSpec.components[0]).toMatchObject({
      id: "component-button",
      name: "Toss Button",
      sourceNodeId: "component-button-source",
      implementation: {
        componentName: "TossButton",
        suggestedProps: [
          {
            name: "label",
            type: "string",
            sourceNodeId: "component-button-label",
            defaultValue: "확인"
          }
        ]
      },
      variants: [
        {
          id: "component-button-primary",
          name: "Primary",
          properties: [{ name: "tone", value: "primary" }]
        }
      ]
    });
    expect(result.implementationSpec.elements[0].structure.componentRef).toEqual({
      definitionId: "component-button",
      detached: false,
      overrides: [{ nodeId: "component-button-label", field: "value", value: "보내기" }]
    });
  });

  test("exports layout and constraints metadata for agents", () => {
    const fixture = tossFixture();
    fixture.pages[0].children[0].layout = {
      mode: "auto",
      direction: "vertical",
      align_items: "center",
      justify_content: "space_between",
      gap: 8,
      padding: { top: 12, right: 16, bottom: 12, left: 16 }
    };
    fixture.pages[0].children[0].children[0].constraints = {
      horizontal: "left_right",
      vertical: "top"
    };
    fixture.pages[0].children[0].children[0].layout_item = {
      position: "absolute",
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    } as any;

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect(button?.structure.layout).toEqual({
      mode: "auto",
      direction: "vertical",
      align_items: "center",
      justify_content: "space_between",
      gap: 8,
      padding: { top: 12, right: 16, bottom: 12, left: 16 }
    });
    expect(button?.structure.children[0].constraints).toEqual({
      horizontal: "left_right",
      vertical: "top"
    });
    expect(button?.structure.children[0].layout_item).toEqual({
      position: "absolute",
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    });
  });

  test("exports image fit mode for agent handoff", () => {
    const result = exportDesignToCode({
      id: "image-file",
      name: "Image File",
      version: 1,
      components: [],
      pages: [
        {
          id: "page-1",
          name: "Page 1",
          children: [
            {
              id: "hero-image",
              kind: "image",
              name: "Hero Image",
              transform: { x: 24, y: 40, rotation: 0 },
              size: { width: 300, height: 300 },
              style: { fill: "#f3f4f6", stroke: null, stroke_width: 0, opacity: 1 },
              content: {
                type: "image",
                asset_id: "asset-hero",
                natural_width: 900,
                natural_height: 300,
                fit_mode: "fit"
              },
              children: []
            }
          ]
        }
      ]
    });

    expect(result.elements[0]?.structure.content).toEqual({
      type: "image",
      assetId: "asset-hero",
      fitMode: "fit"
    });
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

function componentFixture(): DesignFile {
  const source = frameNode(
    "component-button-source",
    "Toss Button",
    0,
    0,
    240,
    56,
    { fill: "#3182f6", stroke: null, stroke_width: 0, opacity: 1 },
    [textNode("component-button-label", "Label", "확인", 82, 16, 96, 24, "#ffffff", 18)]
  );
  const instance = structuredClone(source);
  instance.id = "button-instance-1";
  instance.name = "Send Button Instance";
  instance.kind = "component_instance";
  instance.transform = { x: 40, y: 48, rotation: 0 };
  instance.component_instance = {
    definition_id: "component-button",
    detached: false,
    overrides: [{ node_id: "component-button-label", field: "value", value: "보내기" }]
  };

  return {
    id: "component-file",
    name: "Component File",
    version: 1,
    components: [
      {
        id: "component-button",
        name: "Toss Button",
        source_node: source,
        variants: [
          {
            id: "component-button-primary",
            name: "Primary",
            properties: [{ name: "tone", value: "primary" }]
          }
        ]
      }
    ],
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        children: [instance]
      }
    ]
  };
}
