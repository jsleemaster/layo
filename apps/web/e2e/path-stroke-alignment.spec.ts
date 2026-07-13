import { expect, test, type Page } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

test("closed path alignment paints distinct canvas regions and normalizes open paths", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const projectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${projectId}`);
  const project = (await projectResponse.json()).project;
  const documentId = project.currentDocumentId as string;
  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  const file = (await fileResponse.json()).file;
  const parentId = file.pages[0].children[0].id as string;

  const closedStyle = {
    fill: "#ffffff",
    stroke: "#ef4444",
    stroke_width: 8,
    opacity: 1,
    strokes: [
      stroke("outside", "#ef4444", "outside"),
      stroke("inside", "#2563eb", "inside")
    ]
  };
  const openStyle = {
    fill: "#ffffff",
    stroke: "#16a34a",
    stroke_width: 8,
    opacity: 1,
    strokes: [stroke("requested-outside", "#16a34a", "outside")]
  };
  const seeded = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_path",
          parentId,
          id: "closed-compound",
          name: "닫힌 복합 경로",
          x: 120,
          y: 120,
          width: 120,
          height: 100,
          fill: "#ffffff",
          stroke: null,
          strokeWidth: 0,
          pathData: "M10 50 C10 20 35 10 60 10 C95 10 110 30 110 50 C110 80 85 90 60 90 C25 90 10 70 10 50 Z M45 50 C45 40 52 35 60 35 C70 35 77 42 77 50 C77 60 70 65 60 65 C50 65 45 58 45 50 Z",
          fillRule: "evenodd"
        },
        { type: "set_node_style", nodeId: "closed-compound", style: closedStyle },
        {
          type: "create_path",
          parentId,
          id: "open-cubic",
          name: "열린 곡선",
          x: 320,
          y: 120,
          width: 120,
          height: 100,
          fill: "#ffffff",
          stroke: null,
          strokeWidth: 0,
          pathData: "M10 80 C35 10 85 10 110 80",
          fillRule: "nonzero"
        },
        { type: "set_node_style", nodeId: "open-cubic", style: openStyle }
      ]
    }
  });
  expect(seeded.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByRole("button", { name: "닫힌 복합 경로" }).click();

  const position = page.getByTestId("inspector-stroke-0-position");
  await expect(position).toHaveValue("outside");
  await expect(position).toHaveAttribute("data-effective-position", "outside");

  const colorBounds = await expect.poll(async () => page.evaluate(() => {
    const result = {
      red: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, count: 0 },
      blue: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, count: 0 }
    };
    for (const canvas of document.querySelectorAll("canvas")) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const target = red > 200 && green < 130 && blue < 130
            ? result.red
            : blue > 160 && red < 100 && green < 150
              ? result.blue
              : null;
          if (!target) continue;
          target.minX = Math.min(target.minX, x);
          target.minY = Math.min(target.minY, y);
          target.maxX = Math.max(target.maxX, x);
          target.maxY = Math.max(target.maxY, y);
          target.count += 1;
        }
      }
    }
    return result;
  }), { timeout: 10_000 }).toMatchObject({
    red: { count: expect.any(Number) },
    blue: { count: expect.any(Number) }
  });
  const painted = await page.evaluate(() => {
    const colors = { red: [] as Array<[number, number]>, blue: [] as Array<[number, number]> };
    for (const canvas of document.querySelectorAll("canvas")) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
        if (r > 200 && g < 130 && b < 130) colors.red.push([x, y]);
        if (b > 160 && r < 100 && g < 150) colors.blue.push([x, y]);
      }
    }
    const bounds = (points: Array<[number, number]>) => ({
      minX: Math.min(...points.map(([x]) => x)),
      maxX: Math.max(...points.map(([x]) => x)),
      minY: Math.min(...points.map(([, y]) => y)),
      maxY: Math.max(...points.map(([, y]) => y)),
      count: points.length
    });
    return { red: bounds(colors.red), blue: bounds(colors.blue) };
  });
  expect(painted.red.count).toBeGreaterThan(100);
  expect(painted.blue.count).toBeGreaterThan(100);
  expect(painted.red.minX).toBeLessThan(painted.blue.minX);
  expect(painted.red.maxX).toBeGreaterThan(painted.blue.maxX);

  await page.getByTestId("inspector-tab-dev").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  const pngPath = await download.path();
  if (!pngPath) throw new Error("aligned path PNG path missing");
  const png = await readFile(pngPath);
  expect(png.readUInt32BE(16)).toBeGreaterThan(120);
  expect(png.readUInt32BE(20)).toBeGreaterThan(100);
  await page.getByTestId("inspector-tab-design").click();

  await position.selectOption("inside");
  await expect(position).toHaveValue("inside");
  await page.keyboard.press("Control+z");
  await expect(position).toHaveValue("outside");
  await page.keyboard.press("Control+Shift+z");
  await expect(position).toHaveValue("inside");
  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByRole("button", { name: "닫힌 복합 경로" }).click();
  await expect(page.getByTestId("inspector-stroke-0-position")).toHaveValue("inside");

  await page.getByTestId("layer-panel").getByRole("button", { name: "열린 곡선" }).click();
  const openPosition = page.getByTestId("inspector-stroke-0-position");
  await expect(openPosition).toHaveValue("center");
  await expect(openPosition).toHaveAttribute("data-effective-position", "center");
  await expect(openPosition.locator('option[value="inside"]')).toBeDisabled();
  await expect(openPosition.locator('option[value="outside"]')).toBeDisabled();
});

function stroke(id: string, color: string, position: "inside" | "center" | "outside") {
  return {
    id,
    color,
    opacity: 1,
    width: 8,
    position,
    style: "solid",
    visible: true,
    dasharray: [],
    cap: "round",
    join: "round",
    start_marker: "none",
    end_marker: "none"
  };
}

function openFilePanel(page: Page) {
  return page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
}

async function createProjectFromEmptyState(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue("");
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
}
