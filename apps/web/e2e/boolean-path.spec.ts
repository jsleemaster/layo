import { expect, test, type Page } from "@playwright/test";
import { rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

test("non-destructive boolean controls preserve operands through undo redo and detach", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const projectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get("http://127.0.0.1:4317/projects/" + projectId);
  const project = (await projectResponse.json()).project;
  const fileId = project.currentDocumentId as string;
  const fileResponse = await page.request.get("http://127.0.0.1:4317/files/" + fileId);
  const file = (await fileResponse.json()).file;
  const parentId = file.pages[0].children[0].id as string;

  const createResponse = await page.request.post(
    "http://127.0.0.1:4317/files/" + fileId + "/agent/commands",
    {
      data: {
        dryRun: false,
        commands: [
          { type: "create_node", parentId, node: pathNode("path-left", "왼쪽 경로", 40) },
          { type: "create_node", parentId, node: pathNode("path-right", "오른쪽 경로", 90) }
        ]
      }
    }
  );
  expect(createResponse.ok()).toBeTruthy();

  await page.reload();
  await page.getByTestId("layer-panel").getByRole("button", { name: "왼쪽 경로" }).click();
  await page
    .getByTestId("layer-panel")
    .getByRole("button", { name: "오른쪽 경로" })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "불리언 합치기" }).click();

  const readParentChildren = async () => {
    const response = await page.request.get("http://127.0.0.1:4317/files/" + fileId);
    const payload = await response.json();
    return payload.file.pages[0].children[0].children as Array<{
      id: string;
      content: {
        type: string;
        relation?: { operation: string; source_node_ids: string[] };
      };
      children: Array<{ id: string }>;
    }>;
  };

  await expect.poll(async () => (await readParentChildren())[0]?.content).toMatchObject({
    type: "boolean_path",
    relation: {
      operation: "union",
      source_node_ids: ["path-left", "path-right"]
    }
  });
  await expect.poll(async () => (await readParentChildren())[0]?.children.map((node) => node.id)).toEqual([
    "path-left",
    "path-right"
  ]);

  await page.keyboard.press("Control+Alt+i");
  await expect.poll(async () => (await readParentChildren())[0]?.content.relation?.operation).toBe(
    "intersection"
  );

  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await readParentChildren())[0]?.content.relation?.operation).toBe("union");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await readParentChildren())[0]?.content.relation?.operation).toBe(
    "intersection"
  );

  await page.getByRole("button", { name: "불리언 분리" }).click();
  await expect.poll(async () => (await readParentChildren()).map((node) => node.id)).toEqual([
    "path-left",
    "path-right"
  ]);
});

async function createProjectFromEmptyState(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await expect(page.getByTestId("project-switcher")).toHaveValue("");
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
}

function pathNode(id: string, name: string, x: number) {
  return {
    id,
    kind: "path",
    name,
    transform: { x, y: 40, rotation: 0 },
    size: { width: 100, height: 100 },
    style: {
      fill: "#0ea5e9",
      stroke: "#0f172a",
      stroke_width: 1,
      opacity: 1
    },
    content: {
      type: "path",
      path_data: "M0 0 H100 V100 H0 Z",
      fill_rule: "nonzero"
    },
    children: []
  };
}
