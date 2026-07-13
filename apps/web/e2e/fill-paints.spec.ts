import { expect, test } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";

const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
});

test("Inspector preserves ordered fill paints through lifecycle, artifacts, undo, and reload", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");

  const projectId = await page.getByTestId("project-switcher").inputValue();
  const project = (await (await page.request.get(`http://127.0.0.1:4317/projects/${projectId}`)).json()).project;
  const documentId = project.currentDocumentId as string;
  const file = (await (await page.request.get(`http://127.0.0.1:4317/files/${documentId}`)).json()).file;
  const frame = file.pages[0].children.find((node: { id: string }) => node.id === "frame-1");

  const seeded = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [{
        type: "set_node_style",
        nodeId: "frame-1",
        style: {
          ...frame.style,
          fills: [
            {
              id: "gradient",
              color: "#ef4444",
              paint: {
                type: "gradient",
                gradient: {
                  type: "linear",
                  start: { x: 0, y: 0.5 },
                  end: { x: 1, y: 0.5 },
                  stops: [
                    { color: "#ef4444", opacity: 1, offset: 0 },
                    { color: "#2563eb", opacity: 1, offset: 1 }
                  ]
                }
              },
              opacity: 1,
              visible: true,
              blend_mode: "normal"
            },
            {
              id: "upload-target",
              color: "#111827",
              paint: { type: "solid", color: "#111827" },
              opacity: 0.25,
              visible: true,
              blend_mode: "screen"
            }
          ]
        }
      }]
    }
  });
  expect(seeded.ok()).toBeTruthy();

  await page.reload();
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await page.getByTestId("layer-panel").getByText("랜딩 프레임").click();

  await expect(page.getByTestId("inspector-fill-0-paint-type")).toHaveValue("gradient");
  await page.getByTestId("inspector-fill-0-gradient-start").fill("#22c55e");
  await page.getByTestId("inspector-fill-1-image").setInputFiles({
    name: "texture.png",
    mimeType: "image/png",
    buffer: pixelPng
  });
  await expect(page.getByTestId("inspector-fill-1-paint-type")).toHaveValue("image");
  await expect(page.getByTestId("inspector-fill-1-image-asset")).toContainText("에셋");

  await expect.poll(async () => page.evaluate(() => {
    let green = 0;
    let blue = 0;
    for (const canvas of document.querySelectorAll("canvas")) {
      const context = canvas.getContext("2d");
      if (!context) continue;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const greenChannel = pixels[index + 1];
        const blueChannel = pixels[index + 2];
        if (greenChannel > 120 && red < 150 && blueChannel < 180) green += 1;
        if (blueChannel > 130 && red < 160) blue += 1;
      }
    }
    return green > 20 && blue > 20;
  })).toBe(true);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("inspector-fill-1-paint-type")).toHaveValue("solid");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("inspector-fill-1-paint-type")).toHaveValue("image");

  await page.getByTestId("inspector-fill-row-1").getByRole("button", { name: "채우기를 위로 이동" }).click();
  await expect(page.getByTestId("inspector-fill-0-paint-type")).toHaveValue("image");
  await page.getByTestId("inspector-fill-row-0").getByRole("button", { name: "채우기 복제" }).click();
  await expect(page.locator('[data-testid^="inspector-fill-row-"]')).toHaveCount(3);
  await page.getByTestId("inspector-fill-row-1").getByRole("button", { name: "채우기 숨기기" }).click();
  await page.getByTestId("inspector-fill-row-1").getByRole("button", { name: "채우기 삭제" }).click();
  await expect(page.locator('[data-testid^="inspector-fill-row-"]')).toHaveCount(2);

  await page.getByTestId("inspector-tab-dev").click();
  const svgPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-svg").click();
  const svgPath = await (await svgPromise).path();
  if (!svgPath) throw new Error("fill paint SVG path missing");
  const svg = await readFile(svgPath, "utf8");
  expect(svg).toContain('data-fill-id="upload-target" data-fill-paint="image"');
  expect(svg).toContain("layo-fill-pattern-frame-1-upload-target");
  expect(svg).toContain('data-fill-id="gradient" data-fill-paint="gradient"');
  expect(svg).toContain("layo-fill-gradient-frame-1-gradient");
  expect(svg.indexOf('data-fill-id="upload-target"')).toBeLessThan(svg.indexOf('data-fill-id="gradient"'));

  const pdfPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const pdfPath = await (await pdfPromise).path();
  if (!pdfPath) throw new Error("fill paint PDF path missing");
  const pdf = await readFile(pdfPath, "latin1");
  expect(pdf).toContain("% Layo fill paint upload-target image");
  expect(pdf).toContain("% Layo fill paint gradient gradient");
  expect(pdf).toContain("/Shading");
  expect(pdf).toContain("/Pattern");
  expect(pdf).toContain("/Image");

  await expect.poll(async () => {
    const latest = (await (await page.request.get(`http://127.0.0.1:4317/files/${documentId}`)).json()).file;
    return latest.pages[0].children.find((node: { id: string }) => node.id === "frame-1").style.fills;
  }).toMatchObject([
    { id: "upload-target", paint: { type: "image", asset_id: expect.any(String) } },
    {
      id: "gradient",
      paint: { type: "gradient", gradient: { stops: [{ color: "#22c55e" }, { color: "#2563eb" }] } }
    }
  ]);

  await page.reload();
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await page.getByTestId("layer-panel").getByText("랜딩 프레임").click();
  await expect(page.getByTestId("inspector-fill-0-paint-type")).toHaveValue("image");
  await expect(page.getByTestId("inspector-fill-1-gradient-start")).toHaveValue("#22c55e");
});
