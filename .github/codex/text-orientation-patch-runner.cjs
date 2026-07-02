const fs = require("fs");
const Module = require("module");
const path = require("path");

const scriptPath = ".github/codex/text-orientation-patch.cjs";
let script = fs.readFileSync(scriptPath, "utf8");

const updateBlockRegex = /insertAfter\(\n  "apps\/web\/src\/App\.tsx",\n  '  const updateTextWritingMode[\s\S]*?\n\);\nreplaceOnce\(\n  "apps\/web\/src\/App\.tsx",\n  "        onTextWritingModeChange/;

const updateBlock = `insertAfter(
  "apps/web/src/App.tsx",
  '  const updateTextWritingMode = (nodeId: string, writingMode: TextWritingMode) => {\\n    dispatch({ type: "set_text_writing_mode", nodeId, writingMode });\\n    if (!currentProject) {\\n      return;\\n    }\\n\\n    void persistTextWritingMode(currentProject.currentDocumentId, nodeId, writingMode)\\n      .then(() => {\\n        setCodeExportRevision((current) => current + 1);\\n      })\\n      .catch((error) => {\\n        const message = error instanceof Error ? error.message : "텍스트 쓰기 방향을 저장하지 못했습니다";\\n        setProjectStatus(message);\\n      });\\n  };\\n',
  '\\n  const updateTextOrientation = (nodeId: string, textOrientation: TextOrientation) => {\\n    dispatch({ type: "set_text_orientation", nodeId, textOrientation });\\n    if (!currentProject) {\\n      return;\\n    }\\n\\n    void persistTextOrientation(currentProject.currentDocumentId, nodeId, textOrientation)\\n      .then(() => {\\n        setCodeExportRevision((current) => current + 1);\\n      })\\n      .catch((error) => {\\n        const message = error instanceof Error ? error.message : "텍스트 글자 방향을 저장하지 못했습니다";\\n        setProjectStatus(message);\\n      });\\n  };\\n'
);
replaceOnce(
  "apps/web/src/App.tsx",
  "        onTextWritingModeChange`;

if (!updateBlockRegex.test(script)) {
  throw new Error("Could not find updateTextWritingMode insertion block in patch script");
}

script = script.replace(updateBlockRegex, updateBlock);
const moduleRunner = new Module(path.resolve(scriptPath), module.parent);
moduleRunner.filename = path.resolve(scriptPath);
moduleRunner.paths = Module._nodeModulePaths(process.cwd());
moduleRunner._compile(script, moduleRunner.filename);
