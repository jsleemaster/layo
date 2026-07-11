import { expect, test, type Page } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

test("non-destructive boolean controls preserve operands through every operation, undo, redo, and detach", async ({ page }) => {
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
          { type: "create_path", parentId, ...pathCommand("path-left", "왼쪽 경로", 40) },
          { type: "create_path", parentId, ...pathCommand("path-right", "오른쪽 경로", 90) }
        ]
      }
    }
  );
  expect(createResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
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
  const readBooleanPath = async () =>
    (await readParentChildren()).find((node) => node.content.type === "boolean_path");
  const readOperation = async () => (await readBooleanPath())?.content.relation?.operation;

  await expect.poll(readOperation).toBe("union");
  await expect.poll(async () => (await readBooleanPath())?.children.map((node) => node.id)).toEqual([
    "path-left",
    "path-right"
  ]);
  const booleanNodeId = (await readBooleanPath())?.id;
  expect(booleanNodeId).toBeTruthy();
  const selectBooleanLayer = async () => {
    await page.reload();
    await openFilePanel(page);
    await page
      .getByTestId("layer-panel")
      .getByRole("button", { name: "불리언 경로" })
      .click();
  };

  await selectBooleanLayer();
  await page.getByRole("button", { name: "불리언 빼기" }).click();
  await expect.poll(readOperation).toBe("difference");

  await page.keyboard.press("Control+z");
  await expect.poll(readOperation).toBe("union");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(readOperation).toBe("difference");

  await selectBooleanLayer();
  await page.getByRole("button", { name: "불리언 교차" }).click();
  await expect.poll(readOperation).toBe("intersection");
  await selectBooleanLayer();
  await page.getByRole("button", { name: "불리언 제외" }).click();
  await expect.poll(readOperation).toBe("exclusion");
  await selectBooleanLayer();

  const visibleBounds = await findCanvasColorBounds(page, { r: 14, g: 165, b: 233 });
  await page.mouse.click(visibleBounds.left + 8, (visibleBounds.top + visibleBounds.bottom) / 2, {
    button: "right"
  });
  const contextMenu = page.getByTestId("object-context-menu");
  await expect(contextMenu).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await contextMenu.getByRole("menuitem", { name: "PNG로 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const png = await readFile(await download.path() as string);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.byteLength).toBeGreaterThan(100);

  await selectBooleanLayer();
  await page.getByRole("button", { name: "불리언 분리" }).click();
  await expect.poll(async () => (await readParentChildren()).map((node) => node.id)).toEqual(
    expect.arrayContaining(["path-left", "path-right"])
  );
  await expect.poll(async () => (await readParentChildren()).map((node) => node.id)).not.toContain(
    booleanNodeId
  );
});


test("flattens a boolean result through dry-run, direct control, persistence, and reload", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const projectId = await page.getByTestId("project-switcher").inputValue();
  const project = (await (await page.request.get("http://127.0.0.1:4317/projects/" + projectId)).json()).project;
  const fileId = project.currentDocumentId as string;
  const initialFile = (await (await page.request.get("http://127.0.0.1:4317/files/" + fileId)).json()).file;
  const parentId = initialFile.pages[0].children[0].id as string;

  const seeded = await page.request.post(
    "http://127.0.0.1:4317/files/" + fileId + "/agent/commands",
    {
      data: {
        dryRun: false,
        commands: [
          { type: "create_path", parentId, ...pathCommand("flatten-left", "평탄화 왼쪽", 40) },
          { type: "create_path", parentId, ...pathCommand("flatten-right", "평탄화 오른쪽", 90) },
          {
            type: "create_boolean_path",
            nodeId: "flatten-boolean",
            name: "평탄화 대상",
            operation: "union",
            sourceNodeIds: ["flatten-left", "flatten-right"]
          }
        ]
      }
    }
  );
  expect(seeded.ok()).toBeTruthy();

  const dryRun = await page.request.post(
    "http://127.0.0.1:4317/files/" + fileId + "/agent/commands",
    {
      data: {
        dryRun: true,
        commands: [{
          type: "flatten_path",
          nodeId: "flatten-boolean",
          sourceNodeIds: ["flatten-boolean"],
          name: "평탄화 대상"
        }]
      }
    }
  );
  expect(dryRun.ok()).toBeTruthy();
  expect((await dryRun.json()).result.persisted).toBe(false);
  const beforeApply = (await (await page.request.get("http://127.0.0.1:4317/files/" + fileId)).json()).file;
  expect(beforeApply.pages[0].children[0].children.find((node: { id: string }) => node.id === "flatten-boolean").content.type).toBe("boolean_path");

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByRole("button", { name: "평탄화 대상" }).click();
  await page.getByRole("button", { name: "경로 평탄화" }).click();

  await expect.poll(async () => {
    const file = (await (await page.request.get("http://127.0.0.1:4317/files/" + fileId)).json()).file;
    const node = file.pages[0].children[0].children.find((child: { id: string }) => child.id === "flatten-boolean");
    return {
      type: node?.content.type,
      childCount: node?.children.length,
      relation: node?.content.relation
    };
  }).toEqual({ type: "path", childCount: 0, relation: undefined });

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByRole("button", { name: "평탄화 대상" }).click();
  await expect(page.getByRole("button", { name: "경로 평탄화" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "불리언 분리" })).toBeDisabled();

  const visibleBounds = await findCanvasColorBounds(page, { r: 14, g: 165, b: 233 });
  for (const artifact of [
    { menu: "PNG로 내보내기", extension: ".png" }
  ]) {
    await page.mouse.click(visibleBounds.left + 12, (visibleBounds.top + visibleBounds.bottom) / 2, {
      button: "right"
    });
    const contextMenu = page.getByTestId("object-context-menu");
    await expect(contextMenu).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await contextMenu.getByRole("menuitem", { name: artifact.menu }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(artifact.extension);
    const bytes = await readFile(await download.path() as string);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
});


test("preserves an open path stroke contract through Flatten, reload, canvas, and PNG export", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const projectId = await page.getByTestId("project-switcher").inputValue();
  const project = (await (await page.request.get("http://127.0.0.1:4317/projects/" + projectId)).json()).project;
  const fileId = project.currentDocumentId as string;
  const initialFile = (await (await page.request.get("http://127.0.0.1:4317/files/" + fileId)).json()).file;
  const parentId = initialFile.pages[0].children[0].id as string;

  const seeded = await page.request.post(
    "http://127.0.0.1:4317/files/" + fileId + "/agent/commands",
    {
      data: {
        dryRun: false,
        commands: [{
          type: "create_path",
          parentId,
          id: "open-stroke",
          name: "열린 경로",
          x: 80,
          y: 80,
          width: 180,
          height: 80,
          fill: "transparent",
          stroke: "#0f172a",
          strokeWidth: 8,
          strokeCap: "round",
          strokeJoin: "bevel",
          strokeDasharray: [12, 6],
          strokeStartMarker: "circle",
          strokeEndMarker: "triangle",
          pathData: "M0 40 C45 0 135 80 180 40",
          fillRule: "nonzero"
        }]
      }
    }
  );
  expect(seeded.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByRole("button", { name: "열린 경로" }).click();
  await page.getByRole("button", { name: "경로 평탄화" }).click();

  const readOpenPath = async () => {
    const file = (await (await page.request.get("http://127.0.0.1:4317/files/" + fileId)).json()).file;
    return file.pages[0].children[0].children.find((node: { id: string }) => node.id === "open-stroke");
  };
  await expect.poll(async () => {
    const node = await readOpenPath();
    return {
      type: node?.content.type,
      childCount: node?.children.length,
      closed: /[Zz]/.test(node?.content.path_data ?? ""),
      cap: node?.style.stroke_cap,
      join: node?.style.stroke_join,
      dash: node?.style.stroke_dasharray,
      start: node?.style.stroke_start_marker,
      end: node?.style.stroke_end_marker
    };
  }).toEqual({
    type: "path",
    childCount: 0,
    closed: false,
    cap: "round",
    join: "bevel",
    dash: [12, 6],
    start: "circle",
    end: "triangle"
  });

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByRole("button", { name: "열린 경로" }).click();
  const visibleBounds = await findCanvasColorBounds(page, { r: 15, g: 23, b: 42 });
  expect(visibleBounds.right - visibleBounds.left).toBeGreaterThan(150);
  expect(visibleBounds.bottom - visibleBounds.top).toBeGreaterThan(20);

  await page.getByTestId("editor-rail").getByRole("button", { name: "개발" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  const png = await readFile(await download.path() as string);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.byteLength).toBeGreaterThan(100);
});

async function findCanvasColorBounds(
  page: Page,
  color: { r: number; g: number; b: number }
) {
  return page.evaluate((target) => {
    for (const canvas of Array.from(document.querySelectorAll("canvas"))) {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || canvas.width === 0 || canvas.height === 0) {
        continue;
      }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let hitX = Number.NaN;
      let hitY = Number.NaN;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          if (
            pixels[index + 3] > 200 &&
            Math.abs(pixels[index] - target.r) +
              Math.abs(pixels[index + 1] - target.g) +
              Math.abs(pixels[index + 2] - target.b) <=
              8
          ) {
            if (!Number.isFinite(hitX)) {
              hitX = x;
              hitY = y;
            }
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (Number.isFinite(minX)) {
        const rect = canvas.getBoundingClientRect();
        return {
          left: rect.left + minX / (canvas.width / rect.width),
          top: rect.top + minY / (canvas.height / rect.height),
          right: rect.left + maxX / (canvas.width / rect.width),
          bottom: rect.top + maxY / (canvas.height / rect.height),
          hitX: rect.left + hitX / (canvas.width / rect.width),
          hitY: rect.top + hitY / (canvas.height / rect.height)
        };
      }
    }
    throw new Error("boolean path pixels were not visible");
  }, color);
}

async function openFilePanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await expect(page.getByTestId("layer-panel")).toBeVisible();
}

async function createProjectFromEmptyState(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue("");
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
}

function pathCommand(id: string, name: string, x: number) {
  return {
    id,
    name,
    x,
    y: 40,
    width: 100,
    height: 100,
    fill: "#0ea5e9",
    stroke: "#0f172a",
    strokeWidth: 1,
    pathData: "M0 0 H100 V100 H0 Z",
    fillRule: "nonzero" as const
  };
}
