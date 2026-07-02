const fs = require("fs");

function replaceOnce(path, search, replacement) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(search)) {
    throw new Error(`Missing expected block in ${path}: ${search}`);
  }
  fs.writeFileSync(path, source.replace(search, replacement));
}

const activeRow = "| `2026-07-02-penpot-text-orientation-controls.md` | Active | Next Penpot layout maturity loop after PR #203: add text-orientation controls across document contracts, agent/MCP paths, Inspector, canvas rendering, code export, and Playwright CLI proof. |\n";
const completedRow = "| `2026-07-02-penpot-text-orientation-controls.md` | Completed | PR #204 closes the next layout maturity gap after PR #203 by adding explicit text-orientation metadata/control/export and mixed/upright/sideways vertical glyph rendering in the Konva canvas. Remaining layout gaps are deeper Unicode punctuation/script orientation fidelity, deeper CSS baseline group semantics, and remaining resizing semantics. |\n";

replaceOnce("docs/superpowers/PLAN_STATUS.md", activeRow, "");
replaceOnce(
  "docs/superpowers/PLAN_STATUS.md",
  "| `2026-07-02-penpot-vertical-text-canvas-rendering.md` | Completed |",
  `${completedRow}| \`2026-07-02-penpot-vertical-text-canvas-rendering.md\` | Completed |`
);

replaceOnce(
  "docs/superpowers/plans/2026-07-02-penpot-text-orientation-controls.md",
  "Planned PR verification:\n\n- Full Verification workflow: Penpot maturity/design rule gates, typecheck, web build, core tests, and full Playwright CLI e2e.\n- Storage Restore Drill workflow.\n- Storage Backup Retention workflow.\n- Direct PR review of the final diff.",
  "PR #204 verification:\n\n- Full Verification workflow: Penpot maturity/design rule gates, typecheck, web build, core tests, and full Playwright CLI e2e.\n- Storage Restore Drill workflow.\n- Storage Backup Retention workflow.\n- Direct PR review confirmed the final diff is limited to text-orientation contracts, agent/MCP paths, Inspector/canvas rendering, code export, focused tests, and maturity documentation."
);
