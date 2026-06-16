import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDesignRules } from "./check-design-rules.mjs";

async function withFixture(files, fn) {
  const root = await mkdtemp(path.join(tmpdir(), "design-rules-"));

  try {
    for (const [filePath, content] of Object.entries(files)) {
      const absolutePath = path.join(root, filePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
    }

    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts CSS that imports tokens and uses tokenized values", async () => {
  await withFixture(
    {
      "apps/web/src/design-tokens.css": ":root { --editor-color-panel: #ffffff; --editor-space-md: 16px; }",
      "apps/web/src/styles.css": '@import "./design-tokens.css";\n.panel { color: var(--editor-color-panel); padding: var(--editor-space-md); }',
      "apps/web/src/App.tsx": "export const radius = editorKonvaTokens.radius.frame;"
    },
    async (root) => {
      const result = await checkDesignRules({ root });
      assert.equal(result.violations.length, 0);
    }
  );
});

test("rejects raw visual values outside token files", async () => {
  await withFixture(
    {
      "apps/web/src/design-tokens.css": ":root { --editor-color-panel: #ffffff; }",
      "apps/web/src/styles.css": '@import "./design-tokens.css";\n.panel { color: #111827; padding: 18px; border-radius: 12px; font-size: 13px; }',
      "apps/web/src/App.tsx": "export const radius = 8;"
    },
    async (root) => {
      const result = await checkDesignRules({ root });
      assert.ok(result.violations.some((violation) => violation.rule === "raw-color"));
      assert.ok(result.violations.some((violation) => violation.rule === "raw-spacing"));
      assert.ok(result.violations.some((violation) => violation.rule === "raw-radius"));
      assert.ok(result.violations.some((violation) => violation.rule === "raw-font-size"));
      assert.ok(result.violations.some((violation) => violation.rule === "tsx-raw-visual-number"));
    }
  );
});
