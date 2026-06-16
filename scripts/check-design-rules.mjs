import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CSS_RULES = [
  {
    rule: "raw-color",
    pattern: /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/,
    message: "Use semantic color tokens instead of raw color values."
  },
  {
    rule: "raw-font-size",
    pattern: /font-size\s*:\s*(?!var\()[^;]*\b\d+(?:\.\d+)?px\b/,
    message: "Use typography tokens for font-size."
  },
  {
    rule: "raw-radius",
    pattern: /border-radius\s*:\s*(?!var\()[^;]*\b\d+(?:\.\d+)?px\b/,
    message: "Use radius tokens for border-radius."
  },
  {
    rule: "raw-spacing",
    pattern: /\b(?:padding|margin|gap|row-gap|column-gap)\s*:\s*(?!var\()[^;]*\b[1-9]\d*(?:\.\d+)?px\b/,
    message: "Use spacing tokens for padding, margin, and gaps."
  },
  {
    rule: "negative-letter-spacing",
    pattern: /letter-spacing\s*:\s*-/,
    message: "Letter spacing must not be negative in app UI."
  }
];

const TSX_RULES = [
  {
    rule: "tsx-raw-visual-number",
    pattern: /\b(?:radius|cornerRadius|width|height)\s*=\s*\{?\s*[1-9]\d*(?:\.\d+)?\b/i,
    message: "Use runtime design tokens for fixed visual numbers in TSX."
  },
  {
    rule: "tsx-raw-color",
    pattern: /#[0-9a-fA-F]{3,8}\b/,
    message: "Use runtime design tokens for app UI colors in TSX."
  }
];

async function walkFiles(root, predicate) {
  const results = [];

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "target", ".git"].includes(entry.name)) {
          await walk(fullPath);
        }
      } else if (predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results;
}

function lineNumberForOffset(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function addPatternViolations({ content, filePath, relativePath, rules, violations }) {
  for (const { rule, pattern, message } of rules) {
    const match = content.match(pattern);
    if (match?.index !== undefined) {
      violations.push({
        rule,
        file: relativePath,
        line: lineNumberForOffset(content, match.index),
        message
      });
    }
  }
}

export async function checkDesignRules({ root = defaultRoot } = {}) {
  const violations = [];
  const webSrc = path.join(root, "apps/web/src");
  const cssFiles = await walkFiles(webSrc, (filePath) => filePath.endsWith(".css"));
  const tsxFiles = await walkFiles(webSrc, (filePath) => filePath.endsWith(".tsx") && !filePath.endsWith(".test.tsx"));

  for (const filePath of cssFiles) {
    const relativePath = path.relative(root, filePath);
    const content = await readFile(filePath, "utf8");

    if (relativePath === "apps/web/src/design-tokens.css") {
      continue;
    }

    if (relativePath === "apps/web/src/styles.css" && !content.includes('@import "./design-tokens.css";')) {
      violations.push({
        rule: "missing-token-import",
        file: relativePath,
        line: 1,
        message: "styles.css must import design-tokens.css before app styles."
      });
    }

    addPatternViolations({ content, filePath, relativePath, rules: CSS_RULES, violations });
  }

  for (const filePath of tsxFiles) {
    const relativePath = path.relative(root, filePath);
    const content = await readFile(filePath, "utf8");
    addPatternViolations({ content, filePath, relativePath, rules: TSX_RULES, violations });
  }

  return { violations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkDesignRules();

  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
    }
    process.exit(1);
  }

  console.log("Design rules passed.");
}
