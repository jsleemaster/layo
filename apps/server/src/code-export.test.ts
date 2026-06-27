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

  test("exports color token bindings as CSS variables and implementation metadata", () => {
    const fixture = tossFixture() as any;
    fixture.tokens = [
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#3182f6"
      }
    ];
    fixture.pages[0].children[0].style.fill_token = "color-brand-primary";

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect(result.implementationSpec.tokens.colors).toEqual([
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#3182f6"
      }
    ]);
    expect(result.css).toContain("--layo-token-color-brand-primary: #3182f6;");
    expect(result.css).toContain(
      "background-color: var(--layo-token-color-brand-primary, #3182f6);"
    );
    expect(button?.structure.style).toMatchObject({
      fill: "#3182f6",
      fillToken: "color-brand-primary"
    });
  });

  test("exports spacing token bindings as CSS variables and implementation metadata", () => {
    const fixture = tossFixture() as any;
    fixture.tokens = [
      {
        id: "spacing-layout-lg",
        name: "Layout / Lg",
        type: "spacing",
        value: "32px"
      }
    ];
    fixture.pages[0].children[0].layout = {
      mode: "auto",
      direction: "vertical",
      align_items: "start",
      justify_content: "start",
      gap: 32,
      row_gap: 32,
      column_gap: 32,
      padding: { top: 32, right: 32, bottom: 32, left: 32 },
      spacing_tokens: {
        gap: "spacing-layout-lg",
        row_gap: "spacing-layout-lg",
        column_gap: "spacing-layout-lg",
        padding_top: "spacing-layout-lg",
        padding_right: "spacing-layout-lg",
        padding_bottom: "spacing-layout-lg",
        padding_left: "spacing-layout-lg"
      }
    };

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect((result.implementationSpec.tokens as any).spacing).toEqual([
      {
        id: "spacing-layout-lg",
        name: "Layout / Lg",
        type: "spacing",
        value: "32px"
      }
    ]);
    expect(result.css).toContain("--layo-token-spacing-layout-lg: 32px;");
    expect(result.css).toContain("gap: var(--layo-token-spacing-layout-lg, 32px);");
    expect(result.css).toContain("padding: var(--layo-token-spacing-layout-lg, 32px);");
    expect((button?.structure as any).layoutSpacingTokens).toMatchObject({
      gap: "spacing-layout-lg",
      paddingTop: "spacing-layout-lg"
    });
  });

  test("exports typography token bindings as CSS variables and implementation metadata", () => {
    const fixture = tossFixture() as any;
    fixture.tokens = [
      {
        id: "typography-heading-lg",
        name: "Typography / Heading LG",
        type: "typography",
        value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 })
      }
    ];
    const label = fixture.pages[0].children[0].children[0];
    label.content = {
      ...label.content,
      font_family: "Inter",
      font_size: 32,
      typography_token: "typography-heading-lg"
    };

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect((result.implementationSpec.tokens as any).typography).toEqual([
      {
        id: "typography-heading-lg",
        name: "Typography / Heading LG",
        type: "typography",
        value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 })
      }
    ]);
    expect(result.css).toContain("--layo-token-typography-heading-lg-font-family: Inter, Arial, sans-serif;");
    expect(result.css).toContain("--layo-token-typography-heading-lg-font-size: 32px;");
    expect(result.css).toContain("--layo-token-typography-heading-lg-line-height: 40px;");
    expect(result.css).toContain(
      "font-family: var(--layo-token-typography-heading-lg-font-family, Inter, Arial, sans-serif);"
    );
    expect(result.css).toContain("font-size: var(--layo-token-typography-heading-lg-font-size, 32px);");
    expect(result.css).toContain("line-height: var(--layo-token-typography-heading-lg-line-height, 40px);");
    expect((button?.structure.children[0].content as any).typographyToken).toBe("typography-heading-lg");
  });

  test("exports reusable style bindings as implementation metadata", () => {
    const fixture = tossFixture() as any;
    fixture.styles = [
      { id: "style-color-brand-primary", name: "Brand / Primary", type: "color", value: "#3182f6" },
      {
        id: "style-typography-heading-lg",
        name: "Typography / Heading LG",
        type: "typography",
        value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 })
      }
    ];
    fixture.pages[0].children[0].style.fill_style = "style-color-brand-primary";
    const label = fixture.pages[0].children[0].children[0];
    label.content = {
      ...label.content,
      font_family: "Inter",
      font_size: 32,
      typography_style: "style-typography-heading-lg"
    };

    const result = exportDesignToCode(fixture);

    expect((result.implementationSpec as any).styles).toEqual(fixture.styles);
    expect((result.elements[0].structure.style as any).fillStyle).toBe("style-color-brand-primary");
    expect((result.elements[0].structure.children[0].content as any).typographyStyle).toBe(
      "style-typography-heading-lg"
    );
  });

  test("resolves active token set overrides and excludes disabled set variables", () => {
    const fixture = tossFixture() as any;
    fixture.token_sets = [
      { id: "base", name: "base", enabled: true },
      { id: "dark", name: "dark", enabled: true },
      { id: "draft", name: "draft", enabled: false }
    ];
    fixture.tokens = [
      {
        id: "color-base-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb",
        set_id: "base"
      },
      {
        id: "color-dark-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#93c5fd",
        set_id: "dark"
      },
      {
        id: "color-draft-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#f97316",
        set_id: "draft"
      }
    ];
    fixture.pages[0].children[0].style.fill_token = "color-base-brand-primary";

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect(result.implementationSpec.tokens.tokenSets).toEqual(fixture.token_sets);
    expect(result.implementationSpec.tokens.colors).toEqual([
      {
        id: "color-dark-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#93c5fd",
        set_id: "dark"
      }
    ]);
    expect(result.css).toContain("--layo-token-color-dark-brand-primary: #93c5fd;");
    expect(result.css).not.toContain("--layo-token-color-draft-brand-primary");
    expect(result.css).toContain(
      "background-color: var(--layo-token-color-dark-brand-primary, #93c5fd);"
    );
    expect(button?.structure.style).toMatchObject({
      fill: "#93c5fd",
      fillToken: "color-base-brand-primary"
    });
  });

  test("resolves token theme overrides and exports theme metadata", () => {
    const fixture = tossFixture() as any;
    fixture.token_sets = [
      { id: "base", name: "base", enabled: false },
      { id: "light", name: "light", enabled: false },
      { id: "dark", name: "dark", enabled: false }
    ];
    fixture.token_themes = [
      { id: "theme-light", name: "Light", group: "mode", enabled: false, token_set_ids: ["base", "light"] },
      { id: "theme-dark", name: "Dark", group: "mode", enabled: true, token_set_ids: ["base", "dark"] }
    ];
    fixture.tokens = [
      {
        id: "color-base-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb",
        set_id: "base"
      },
      {
        id: "color-light-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#60a5fa",
        set_id: "light"
      },
      {
        id: "color-dark-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#93c5fd",
        set_id: "dark"
      }
    ];
    fixture.pages[0].children[0].style.fill_token = "color-base-brand-primary";

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect((result.implementationSpec.tokens as any).tokenThemes).toEqual(fixture.token_themes);
    expect(result.implementationSpec.tokens.colors).toEqual([
      {
        id: "color-dark-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#93c5fd",
        set_id: "dark"
      }
    ]);
    expect(result.css).toContain("--layo-token-color-dark-brand-primary: #93c5fd;");
    expect(button?.structure.style).toMatchObject({
      fill: "#93c5fd",
      fillToken: "color-base-brand-primary"
    });
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
          properties: [{ name: "tone", value: "primary", type: "select" }]
        }
      ]
    });
    expect(result.implementationSpec.elements[0].structure.componentRef).toEqual({
      definitionId: "component-button",
      variantId: "component-button-primary",
      detached: false,
      overrides: [{ nodeId: "component-button-label", field: "value", value: "보내기" }]
    });
  });

  test("exports repo component mappings for component definitions and instances", () => {
    const fixture = componentFixture() as any;
    fixture.code_mappings = [repoComponentMappingFixture()];

    const result = exportDesignToCode(fixture);
    const component = result.implementationSpec.components[0] as any;
    const instance = result.elements[0] as any;

    expect(component.repoMapping).toMatchObject({
      id: "mapping-toss-button",
      componentId: "component-button",
      packageName: "@repo/ui",
      importPath: "@repo/ui/toss-button",
      exportName: "TossButton",
      importMode: "named",
      importStatement: 'import { TossButton } from "@repo/ui/toss-button";',
      usage: "<TossButton label={label} />",
      props: [
        {
          name: "label",
          type: "string",
          sourceNodeId: "component-button-label",
          sourceField: "text",
          defaultValue: "확인"
        }
      ],
      docsUrl: "https://repo.example/ui/toss-button"
    });
    expect(component.implementation.repoMapping).toEqual(component.repoMapping);
    expect(instance.structure.repoMapping).toMatchObject({
      componentId: "component-button",
      importStatement: 'import { TossButton } from "@repo/ui/toss-button";',
      usage: "<TossButton label={label} />"
    });
    expect(instance.implementation.repoMapping).toMatchObject({
      componentId: "component-button",
      usage: "<TossButton label={label} />"
    });
    expect(instance.jsModule).toContain("repoMapping");
  });

  test("exports variant-aware repo component mapping props", () => {
    const fixture = componentFixture() as any;
    fixture.code_mappings = [
      {
        ...repoComponentMappingFixture(),
        variant_props: [
          {
            name: "tone",
            type: "string",
            variant_property: "tone",
            default_value: "secondary"
          }
        ]
      }
    ];

    const result = exportDesignToCode(fixture);
    const component = result.implementationSpec.components[0] as any;
    const instance = result.elements[0] as any;

    expect(component.repoMapping.variantProps).toEqual([
      {
        name: "tone",
        type: "string",
        variantProperty: "tone",
        defaultValue: "primary"
      }
    ]);
    expect(component.repoMapping.usage).toBe('<TossButton label={label} tone="primary" />');
    expect(instance.structure.repoMapping.variantProps).toEqual(component.repoMapping.variantProps);
    expect(instance.structure.repoMapping.usage).toBe('<TossButton label={label} tone="primary" />');
  });

  test("exports selected component instance variant mapping props", () => {
    const fixture = componentFixture() as any;
    fixture.components[0].variants.push({
      id: "component-button-secondary",
      name: "Secondary",
      properties: [{ name: "tone", value: "secondary", type: "select" }]
    });
    fixture.pages[0].children[0].component_instance.variant_id = "component-button-secondary";
    fixture.code_mappings = [
      {
        ...repoComponentMappingFixture(),
        variant_props: [
          {
            name: "tone",
            type: "string",
            variant_property: "tone",
            default_value: "fallback"
          }
        ]
      }
    ];

    const result = exportDesignToCode(fixture);
    const component = result.implementationSpec.components[0] as any;
    const instance = result.elements[0] as any;

    expect(component.repoMapping.usage).toBe('<TossButton label={label} tone="primary" />');
    expect(instance.structure.componentRef.variantId).toBe("component-button-secondary");
    expect(instance.structure.repoMapping.variantProps).toEqual([
      {
        name: "tone",
        type: "string",
        variantProperty: "tone",
        defaultValue: "secondary"
      }
    ]);
    expect(instance.structure.repoMapping.usage).toBe('<TossButton label={label} tone="secondary" />');
  });

  test("exports layout and constraints metadata for agents", () => {
    const fixture = tossFixture();
    fixture.pages[0].children[0].layout = {
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 2,
      align_items: "baseline",
      justify_content: "space_between",
      justify_items: "stretch",
      wrap: "wrap",
      align_content: "space_around",
      width_sizing: "fit",
      height_sizing: "fit",
      gap: 8,
      row_gap: 24,
      column_gap: 6,
      padding: { top: 12, right: 16, bottom: 12, left: 16 }
    };
    fixture.pages[0].children[0].children[0].constraints = {
      horizontal: "left_right",
      vertical: "top"
    };
    fixture.pages[0].children[0].children[0].layout_item = {
      position: "absolute",
      width_sizing: "fill",
      height_sizing: "fill",
      justify_self: "end",
      align_self: "center",
      grid_column: 3,
      grid_row: 2,
      grid_column_span: 2,
      grid_row_span: 2,
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    } as any;

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect(button?.structure.layout).toEqual({
      mode: "grid",
      direction: "horizontal",
      grid_columns: 2,
      grid_rows: 2,
      align_items: "baseline",
      justify_content: "space_between",
      justify_items: "stretch",
      wrap: "wrap",
      align_content: "space_around",
      width_sizing: "fit",
      height_sizing: "fit",
      gap: 8,
      row_gap: 24,
      column_gap: 6,
      padding: { top: 12, right: 16, bottom: 12, left: 16 }
    });
    expect(button?.structure.children[0].constraints).toEqual({
      horizontal: "left_right",
      vertical: "top"
    });
    expect(button?.structure.children[0].layout_item).toEqual({
      position: "absolute",
      width_sizing: "fill",
      height_sizing: "fill",
      justify_self: "end",
      align_self: "center",
      grid_column: 3,
      grid_row: 2,
      grid_column_span: 2,
      grid_row_span: 2,
      margin: { top: 10, right: 8, bottom: 14, left: 6 }
    });
  });

  test("exports ready-for-dev annotations for code structures", () => {
    const fixture = tossFixture() as any;
    fixture.tokens = [
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#3182f6"
      },
      {
        id: "spacing-layout-lg",
        name: "Layout / Lg",
        type: "spacing",
        value: "32px"
      }
    ];
    fixture.pages[0].children[0].style.fill_token = "color-brand-primary";
    fixture.pages[0].children[0].layout = {
      mode: "auto",
      direction: "vertical",
      align_items: "center",
      justify_content: "center",
      gap: 32,
      row_gap: 32,
      column_gap: 32,
      padding: { top: 32, right: 32, bottom: 32, left: 32 },
      spacing_tokens: {
        gap: "spacing-layout-lg",
        row_gap: "spacing-layout-lg",
        column_gap: "spacing-layout-lg",
        padding_top: "spacing-layout-lg",
        padding_right: "spacing-layout-lg",
        padding_bottom: "spacing-layout-lg",
        padding_left: "spacing-layout-lg"
      }
    };

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");

    expect(button?.structure.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tds-button-primary-geometry",
          label: "크기/위치",
          value: "240 x 56 · X 64, Y 120"
        }),
        expect.objectContaining({
          id: "tds-button-primary-style",
          label: "스타일",
          detail: "fill token color-brand-primary maps to var(--layo-token-color-brand-primary)"
        }),
        expect.objectContaining({
          id: "tds-button-primary-layout",
          label: "레이아웃",
          detail: "spacing token spacing-layout-lg is used for gap and padding"
        })
      ])
    );
    expect(button?.structure.children[0].annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tds-button-label-content",
          label: "콘텐츠",
          value: "\"송금하기\" · 18px Arial"
        })
      ])
    );
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

  test("exports text writing mode for vertical text handoff", () => {
    const fixture = tossFixture();
    const text = fixture.pages[0].children[0].children[0];
    if (text.content.type !== "text") {
      throw new Error("Expected text fixture");
    }
    text.content = { ...text.content, writing_mode: "vertical_rl" } as any;

    const result = exportDesignToCode(fixture);
    const button = result.elements.find((element) => element.id === "tds-button-primary");
    const label = button?.structure.children[0];

    expect(label?.content).toEqual({
      type: "text",
      value: "송금하기",
      fontSize: 18,
      fontFamily: "Arial",
      writingMode: "vertical_rl"
    });
    expect(result.css).toContain("writing-mode: vertical-rl;");
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
    variant_id: "component-button-primary",
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
            properties: [{ name: "tone", value: "primary", type: "select" }]
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

function repoComponentMappingFixture() {
  return {
    id: "mapping-toss-button",
    component_id: "component-button",
    package_name: "@repo/ui",
    import_path: "@repo/ui/toss-button",
    export_name: "TossButton",
    import_mode: "named",
    props: [
      {
        name: "label",
        type: "string",
        source_node_id: "component-button-label",
        source_field: "text",
        default_value: "확인"
      }
    ],
    docs_url: "https://repo.example/ui/toss-button"
  };
}
