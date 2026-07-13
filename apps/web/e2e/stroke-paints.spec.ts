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

test("Inspector preserves gradient and image stroke paints through artifacts and reload", async ({ page }) => {
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
          strokes: [
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
              width: 8,
              position: "outside",
              style: "solid",
              visible: true,
              dasharray: [],
              cap: "round",
              join: "round",
              start_marker: "none",
              end_marker: "none"
            },
            {
              id: "upload-target",
              color: "#111827",
              paint: { type: "solid", color: "#111827" },
              opacity: 1,
              width: 5,
              position: "inside",
              style: "solid",
              visible: true,
              dasharray: [],
              cap: "butt",
              join: "miter",
              start_marker: "none",
              end_marker: "none"
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

  await expect(page.getByTestId("inspector-stroke-0-paint-type")).toHaveValue("gradient");
  await page.getByTestId("inspector-stroke-0-gradient-start").fill("#22c55e");
  await page.getByTestId("inspector-stroke-1-image").setInputFiles({
    name: "border.png",
    mimeType: "image/png",
    buffer: pixelPng
  });
  await expect(page.getByTestId("inspector-stroke-1-paint-type")).toHaveValue("image");
  await expect(page.getByTestId("inspector-stroke-1-image-asset")).toContainText("에셋");

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("inspector-stroke-1-paint-type")).toHaveValue("solid");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("inspector-stroke-1-paint-type")).toHaveValue("image");

  await page.getByTestId("inspector-tab-dev").click();
  const svgPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-svg").click();
  const svgPath = await (await svgPromise).path();
  if (!svgPath) throw new Error("stroke paint SVG path missing");
  const svg = await readFile(svgPath, "utf8");
  expect(svg).toContain('data-stroke-id="gradient" data-stroke-paint="gradient"');
  expect(svg).toContain("layo-stroke-gradient-frame-1-gradient");
  expect(svg).toContain('data-stroke-id="upload-target" data-stroke-paint="image"');
  expect(svg).toContain("layo-stroke-pattern-frame-1-upload-target");

  const pdfPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const pdfPath = await (await pdfPromise).path();
  if (!pdfPath) throw new Error("stroke paint PDF path missing");
  const pdf = await readFile(pdfPath, "latin1");
  expect(pdf).toContain("% Layo stroke paint gradient gradient");
  expect(pdf).toContain("% Layo stroke paint upload-target image");
  expect(pdf).toContain("/Shading");
  expect(pdf).toContain("/Pattern");
  expect(pdf).toContain("/Image");

  await expect.poll(async () => {
    const latest = (await (await page.request.get(`http://127.0.0.1:4317/files/${documentId}`)).json()).file;
    return latest.pages[0].children.find((node: { id: string }) => node.id === "frame-1").style.strokes;
  }).toMatchObject([
    {
      id: "gradient",
      paint: { type: "gradient", gradient: { stops: [{ color: "#22c55e" }, { color: "#2563eb" }] } }
    },
    { id: "upload-target", paint: { type: "image", asset_id: expect.any(String) } }
  ]);

  await page.reload();
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await page.getByTestId("layer-panel").getByText("랜딩 프레임").click();
  await expect(page.getByTestId("inspector-stroke-0-gradient-start")).toHaveValue("#22c55e");
  await expect(page.getByTestId("inspector-stroke-1-paint-type")).toHaveValue("image");
});
