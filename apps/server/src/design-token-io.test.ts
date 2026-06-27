import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  exportDesignTokensToDtcg,
  importDesignTokenDocumentFromDtcg,
  importDesignTokensFromDtcg
} from "./design-token-io";
import { FileStorage } from "./storage";

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("DTCG color token import/export", () => {
  test("exports color tokens as nested DTCG JSON", () => {
    expect(
      exportDesignTokensToDtcg([
        {
          id: "color-brand-primary",
          name: "Brand / Primary",
          type: "color",
          value: "#2563eb"
        }
      ])
    ).toEqual({
      $metadata: {
        tokenSetOrder: ["global"],
        activeThemes: []
      },
      global: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      }
    });
  });

  test("imports nested DTCG JSON into stable document color tokens", () => {
    expect(
      importDesignTokensFromDtcg({
        $metadata: {
          tokenSetOrder: ["global"],
          activeThemes: []
        },
        global: {
          Brand: {
            Primary: {
              $type: "color",
              $value: "#2563eb"
            },
            Accent: {
              $value: "#f97316"
            }
          },
          Neutral: {
            $type: "color",
            "Canvas BG": {
              $value: "#f8fafc"
            }
          }
        }
      })
    ).toEqual([
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb"
      },
      {
        id: "color-neutral-canvas-bg",
        name: "Neutral / Canvas BG",
        type: "color",
        value: "#f8fafc"
      }
    ]);
  });

  test("imports raw DTCG token trees without dropping the top-level group", () => {
    expect(
      importDesignTokensFromDtcg({
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      })
    ).toEqual([
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb"
      }
    ]);
  });

  test("storage persists imported DTCG color tokens and exports them again", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "layo-token-"));
    const storage = new FileStorage(tempRoot);
    await storage.createProject({
      projectId: "project-token",
      name: "토큰 프로젝트",
      documentId: "document-token",
      documentName: "토큰 문서"
    });

    const imported = await storage.importTokensDtcg("document-token", {
      global: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      }
    });
    const persisted = await storage.readFile("document-token");
    const exported = await storage.exportTokensDtcg("document-token");

    expect(imported.tokens).toEqual([
      {
        id: "color-brand-primary",
        name: "Brand / Primary",
        type: "color",
        value: "#2563eb"
      }
    ]);
    expect(persisted.tokens).toEqual(imported.tokens);
    expect(exported).toMatchObject({
      global: {
        Brand: {
          Primary: {
            $value: "#2563eb"
          }
        }
      }
    });
  });

  test("imports DTCG spacing and dimension tokens into stable document spacing tokens", () => {
    expect(
      importDesignTokensFromDtcg({
        global: {
          Spacing: {
            $type: "dimension",
            Lg: {
              $value: "32px"
            },
            Stack: {
              $type: "spacing",
              $value: "24"
            }
          }
        }
      })
    ).toEqual([
      {
        id: "spacing-spacing-lg",
        name: "Spacing / Lg",
        type: "spacing",
        value: "32px"
      },
      {
        id: "spacing-spacing-stack",
        name: "Spacing / Stack",
        type: "spacing",
        value: "24"
      }
    ]);
  });

  test("exports spacing tokens as DTCG dimension tokens", () => {
    expect(
      exportDesignTokensToDtcg([
        {
          id: "spacing-layout-gap",
          name: "Layout / Gap",
          type: "spacing",
          value: "20"
        }
      ])
    ).toMatchObject({
      global: {
        Layout: {
          Gap: {
            $type: "dimension",
            $value: "20"
          }
        }
      }
    });
  });

  test("imports and exports DTCG typography composite tokens", () => {
    const imported = importDesignTokensFromDtcg({
      global: {
        Typography: {
          "Heading LG": {
            $type: "typography",
            $value: {
              fontFamily: "Inter",
              fontSize: 32,
              lineHeight: 40
            }
          }
        }
      }
    });

    expect(imported).toEqual([
      {
        id: "typography-typography-heading-lg",
        name: "Typography / Heading LG",
        type: "typography",
        value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 })
      }
    ]);

    expect(exportDesignTokensToDtcg(imported)).toMatchObject({
      global: {
        Typography: {
          "Heading LG": {
            $type: "typography",
            $value: {
              fontFamily: "Inter",
              fontSize: 32,
              lineHeight: 40
            }
          }
        }
      }
    });
  });

  test("imports and exports ordered token sets with active set metadata", () => {
    const imported = importDesignTokenDocumentFromDtcg({
      $metadata: {
        tokenSetOrder: ["base", "dark"],
        activeThemes: [],
        activeTokenSets: ["base"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      },
      dark: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#93c5fd"
          }
        }
      }
    });

    expect(imported.tokenSets).toEqual([
      { id: "base", name: "base", enabled: true },
      { id: "dark", name: "dark", enabled: false }
    ]);
    expect(imported.tokens).toEqual([
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
      }
    ]);

    expect(exportDesignTokensToDtcg(imported.tokens, imported.tokenSets)).toMatchObject({
      $metadata: {
        tokenSetOrder: ["base", "dark"],
        activeThemes: [],
        activeTokenSets: ["base"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      },
      dark: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#93c5fd"
          }
        }
      }
    });
  });

  test("imports and exports token themes with active theme metadata", () => {
    const imported = importDesignTokenDocumentFromDtcg({
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeThemes: ["theme-dark"]
      },
      $themes: [
        {
          id: "theme-light",
          name: "Light",
          group: "mode",
          selectedTokenSets: ["base", "light"]
        },
        {
          id: "theme-dark",
          name: "Dark",
          group: "mode",
          selectedTokenSets: ["base", "dark"]
        }
      ],
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      },
      light: {
        Surface: {
          Canvas: {
            $type: "color",
            $value: "#ffffff"
          }
        }
      },
      dark: {
        Surface: {
          Canvas: {
            $type: "color",
            $value: "#0f172a"
          }
        }
      }
    });

    expect(imported.tokenThemes).toEqual([
      {
        id: "theme-light",
        name: "Light",
        group: "mode",
        enabled: false,
        token_set_ids: ["base", "light"]
      },
      {
        id: "theme-dark",
        name: "Dark",
        group: "mode",
        enabled: true,
        token_set_ids: ["base", "dark"]
      }
    ]);

    expect(exportDesignTokensToDtcg(imported.tokens, imported.tokenSets, imported.tokenThemes)).toMatchObject({
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeThemes: ["theme-dark"],
        activeTokenSets: []
      },
      $themes: [
        {
          id: "theme-light",
          name: "Light",
          group: "mode",
          selectedTokenSets: ["base", "light"]
        },
        {
          id: "theme-dark",
          name: "Dark",
          group: "mode",
          selectedTokenSets: ["base", "dark"]
        }
      ]
    });
  });
});
