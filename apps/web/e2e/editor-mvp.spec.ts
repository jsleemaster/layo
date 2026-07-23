import { expect, test, type Page, type Route } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { createZipArchive } from "../../server/src/file-archive";
import { resetE2eStorage } from "./test-storage";

test.beforeEach(async () => {
  await resetE2eStorage();
});

async function openFilePanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
}

async function openEmptyEditor(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue("");
  await expect(page.getByTestId("project-status")).toContainText("저장된 프로젝트 없음");
}

function floatingToolbarZoom(page: Page, label: string) {
  return page.getByTestId("floating-toolbar").getByText(label);
}

test("opens with a Figma-like assets panel and keeps project controls behind the file rail", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  await expect(page.getByTestId("asset-panel")).toBeVisible();
  await expect(page.getByRole("heading", { name: "에셋" })).toBeVisible();
  await expect(page.getByTestId("asset-search")).toHaveAttribute("placeholder", "모든 라이브러리 검색");
  await expect(page.getByText("아직 라이브러리가 없습니다.")).toBeVisible();
  await expect(page.getByText("iOS 18 and iPadOS 18")).toBeVisible();
  await expect(page.getByText("visionOS 26")).toBeVisible();
  await expect(page.getByTestId("asset-library-card")).toHaveCount(6);
  const firstLibraryCard = page.getByTestId("asset-library-card").filter({ hasText: "iOS 18 and iPadOS 18" });
  await expect(firstLibraryCard.getByTestId("asset-library-thumbnail")).toHaveAttribute(
    "aria-label",
    "iOS 18 and iPadOS 18 라이브러리 미리보기"
  );
  await expect(firstLibraryCard.getByText("156개의 컴포넌트")).toBeVisible();
  await expect(firstLibraryCard.getByText("템플릿 24개")).toBeVisible();
  await expect(page.getByTestId("layer-panel")).toBeHidden();
  await expect(page.getByTestId("project-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: "에셋" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "파일" }).click();
  await expect(page.getByTestId("project-panel")).toBeVisible();
  await expect(page.getByTestId("layer-panel")).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toBeHidden();

  await page.getByRole("button", { name: "에셋" }).click();
  await expect(page.getByTestId("asset-panel")).toBeVisible();
  await expect(page.getByTestId("project-panel")).toBeHidden();
});

test("editor chrome uses the generated Layo brand logo assets", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  const brandLogo = page.getByTestId("layo-brand-logo");
  await expect(brandLogo).toBeVisible();
  await expect(brandLogo).toHaveAttribute("src", /layo-logo-mark\.png$/);
  await expect(brandLogo).toHaveJSProperty("complete", true);

  const naturalSize = await brandLogo.evaluate((node) => ({
    width: (node as HTMLImageElement).naturalWidth,
    height: (node as HTMLImageElement).naturalHeight
  }));
  expect(naturalSize.width).toBeGreaterThan(0);
  expect(naturalSize.height).toBeGreaterThan(0);

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/assets/brand/layo-logo-mark.png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/assets/brand/layo-logo-mark.png"
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
});

async function createProjectFromEmptyState(page: Page) {
  await openEmptyEditor(page);
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const projectId = await page.getByTestId("project-switcher").inputValue();
  expect(projectId).not.toBe("");
  expect(projectId).not.toBe("sample-project");
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${projectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  return {
    projectId,
    documentId: projectPayload.project.currentDocumentId as string
  };
}

async function createNamedProject(page: Page, name: string) {
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const projectId = await page.getByTestId("project-switcher").inputValue();
  await page.getByTestId("project-name").fill(name);
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByTestId("project-status")).toContainText(`${name} 저장됨`);
  return projectId;
}

async function createImageDataTransfer(
  page: Page,
  name: string,
  size: { width: number; height: number } = { width: 16, height: 12 },
  fillColor = "#2563eb",
  mimeType: "image/png" | "image/webp" = "image/png"
) {
  return page.evaluateHandle(async ({ fileName, imageSize, color, imageMimeType }) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas context missing");
    }
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(4, 3, 8, 6);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error(`${imageMimeType} blob missing`));
        }
      }, imageMimeType);
    });
    const file = new File([blob], fileName, { type: blob.type || imageMimeType });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    return dataTransfer;
  }, { fileName: name, imageSize: size, color: fillColor, imageMimeType: mimeType });
}

async function createSvgImageDataTransfer(
  page: Page,
  name: string,
  size: { width: number; height: number } = { width: 18, height: 14 },
  fillColor = "#7c3aed"
) {
  return page.evaluateHandle(({ fileName, imageSize, color }) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize.width}" height="${imageSize.height}" viewBox="0 0 ${imageSize.width} ${imageSize.height}"><rect width="${imageSize.width}" height="${imageSize.height}" fill="${color}"/><circle cx="9" cy="7" r="4" fill="#ffffff"/></svg>`;
    const file = new File([svg], fileName, { type: "image/svg+xml" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    return dataTransfer;
  }, { fileName: name, imageSize: size, color: fillColor });
}

async function createImageUploadFile(
  page: Page,
  name: string,
  size: { width: number; height: number },
  fillColor: string
) {
  const payload = await page.evaluate(async ({ fileName, imageSize, color }) => {
    const canvas = document.createElement("canvas");
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas context missing");
    }
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(4, 3, 8, 6);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error("png blob missing"));
        }
      }, "image/png");
    });
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    return { name: fileName, mimeType: "image/png", bytes };
  }, { fileName: name, imageSize: size, color: fillColor });

  return {
    name: payload.name,
    mimeType: payload.mimeType,
    buffer: Buffer.from(payload.bytes)
  };
}

function flattenNodeKinds(nodes: Array<{ kind: string; children: unknown[] }>): string[] {
  return nodes.flatMap((node) => [
    node.kind,
    ...flattenNodeKinds(node.children as Array<{ kind: string; children: unknown[] }>)
  ]);
}

async function findCanvasColorBounds(page: Page, color: { r: number; g: number; b: number }) {
  return page.evaluate((targetColor) => {
    const colorDistance = (red: number, green: number, blue: number) =>
      Math.abs(red - targetColor.r) + Math.abs(green - targetColor.g) + Math.abs(blue - targetColor.b);
    let bestBounds: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      count: number;
    } | null = null;

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
      let count = 0;

      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          if (pixels[index + 3] < 200) {
            continue;
          }
          if (colorDistance(pixels[index], pixels[index + 1], pixels[index + 2]) > 8) {
            continue;
          }

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          count += 1;
        }
      }

      if (!count || (bestBounds && bestBounds.count >= count)) {
        continue;
      }

      const rect = canvas.getBoundingClientRect();
      bestBounds = {
        left: rect.left + minX / (canvas.width / rect.width),
        top: rect.top + minY / (canvas.height / rect.height),
        right: rect.left + maxX / (canvas.width / rect.width),
        bottom: rect.top + maxY / (canvas.height / rect.height),
        count
      };
    }

    if (!bestBounds) {
      throw new Error("target canvas color was not visible");
    }

    return bestBounds;
  }, color);
}

test("creates, reopens, and team-links a saved project", async ({ page }) => {
  await openEmptyEditor(page);

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const createdProjectId = await page.getByTestId("project-switcher").inputValue();
  expect(createdProjectId).not.toBe("sample-project");
  await expect(page.getByTestId("project-name")).toHaveValue(/새 프로젝트/);

  const projectsResponse = await page.request.get("http://127.0.0.1:4317/projects");
  expect(projectsResponse.ok()).toBeTruthy();
  const projectsPayload = await projectsResponse.json();
  expect(projectsPayload.projects.map((project: { projectId: string }) => project.projectId)).toContain(
    createdProjectId
  );

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(createdProjectId);

  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");

  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${createdProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  expect((await projectResponse.json()).project.sharing).toMatchObject({ mode: "team" });
});

test("inspector exposes last-baseline layout alignment controls", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const response = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "horizontal",
            align_items: "last_baseline",
            justify_content: "start",
            gap: 10,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        }
      ]
    }
  });
  expect(response.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByText("랜딩 프레임").click();
  const alignItems = page.getByTestId("inspector-layout-align-items");
  await expect(alignItems).toHaveValue("last_baseline");
  await expect(alignItems.locator("option", { hasText: "마지막 기준선" })).toHaveValue("last_baseline");
  await alignItems.selectOption("baseline");
  await expect(alignItems).toHaveValue("baseline");
  await alignItems.selectOption("last_baseline");
  await expect(alignItems).toHaveValue("last_baseline");
});

test("baseline alignment visibly synthesizes vertical writing mode text to the row border edge", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const response = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        { type: "update_geometry", nodeId: "frame-1", width: 360, height: 160 },
        { type: "update_geometry", nodeId: "text-1", width: 40, height: 96 },
        { type: "update_text", nodeId: "text-1", value: "縦書き" },
        { type: "set_text_writing_mode", nodeId: "text-1", writingMode: "vertical_rl" },
        {
          type: "set_layout",
          nodeId: "frame-1",
          layout: {
            mode: "auto",
            direction: "horizontal",
            align_items: "baseline",
            justify_content: "start",
            gap: 10,
            padding: { top: 20, right: 20, bottom: 20, left: 20 }
          }
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          width: 80,
          height: 24,
          fontSize: 16,
          fontFamily: "Inter"
        }
      ]
    }
  });
  expect(response.ok()).toBeTruthy();

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const frame = filePayload.file.pages[0].children[0];
  const caption = frame.children.find((node: { id: string }) => node.id === "caption-1");
  expect(caption.transform).toMatchObject({ x: 70, y: 103 });

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("layer-panel").getByText("캡션").click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("70");
  await expect(page.getByTestId("inspector-y")).toHaveValue("103");
});

test("file panel exports a Layo archive and reviews it before import", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 파일 아카이브 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${documentId}.layo.zip`);
  const archivePath = await download.path();
  if (!archivePath) {
    throw new Error("archive download path missing");
  }

  await page.getByTestId("file-archive-upload").setInputFiles(archivePath);
  const review = page.getByTestId("file-archive-review");
  await expect(review).toContainText("가져오기 전 검토");
  await expect(review).toContainText("새 문서");
  await expect(review).toContainText("페이지 1개");

  await page.getByTestId("file-archive-import-name").fill("아카이브 복원본");
  await page.getByRole("button", { name: "검토한 아카이브 가져오기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("아카이브 복원본 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("아카이브 복원본");
});

test("file panel reviews and imports an external Figma image package", async ({ page }, testInfo) => {
  await createProjectFromEmptyState(page);
  const figmaZipPath = testInfo.outputPath("landing.figma.zip");
  const image = await createImageUploadFile(page, "figma-image-hero.png", { width: 12, height: 8 }, "#1d4ed8");
  const figmaArchive = createZipArchive([
    {
      path: "figma-file.json",
      data: Buffer.from(JSON.stringify({
      name: "Figma landing",
      document: {
        id: "0:0",
        name: "Document",
        type: "DOCUMENT",
        children: [
          {
            id: "1:1",
            name: "Page 1",
            type: "CANVAS",
            children: [
              {
                id: "2:1",
                name: "Hero",
                type: "FRAME",
                absoluteBoundingBox: { x: 80, y: 96, width: 320, height: 180 },
                fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
                children: [
                  {
                    id: "3:1",
                    name: "Hero image",
                    type: "RECTANGLE",
                    absoluteBoundingBox: { x: 104, y: 122, width: 180, height: 96 },
                    fills: [
                      {
                        type: "IMAGE",
                        visible: true,
                        imageRef: "figma-image-hero",
                        scaleMode: "FILL"
                      }
                    ]
                  },
                  {
                    id: "4:1",
                    name: "Imported headline",
                    type: "TEXT",
                    characters: "Hello from Figma",
                    absoluteBoundingBox: { x: 112, y: 232, width: 160, height: 24 },
                    style: { fontSize: 18, fontFamily: "Inter" }
                  }
                ]
              }
            ]
          }
        ]
      }
    }), "utf8")
    },
    { path: `assets/${image.name}`, data: image.buffer }
  ]);
  await writeFile(figmaZipPath, figmaArchive);

  await page.getByTestId("external-migration-upload").setInputFiles(figmaZipPath);
  const review = page.getByTestId("external-migration-review");
  await expect(review).toContainText("Figma");
  await expect(review).toContainText("ZIP");
  await expect(review).toContainText("가져오기 가능");
  await expect(review).toContainText("문서 후보 1개");
  await expect(review).toContainText("에셋 1개");
  await expect(review).toContainText("assets/figma-image-hero.png");
  await expect(page.getByTestId("external-migration-status")).toContainText("외부 디자인 검토됨");
  await page.getByRole("button", { name: "외부 디자인 가져오기" }).click();
  await expect(page.getByTestId("external-migration-status")).toContainText("Figma landing 가져옴");
  await expect(page.getByTestId("project-status")).toContainText("Figma landing 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("Figma landing");
  await expect(page.getByTestId("layer-panel")).toContainText("Imported headline");
  await expect(page.getByTestId("layer-panel")).toContainText("Hero image");

  const importedProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${importedProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const projectPayload = await projectResponse.json();
  const fileResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${projectPayload.project.currentDocumentId}`
  );
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const frame = filePayload.file.pages[0].children[0];
  expect(frame).toMatchObject({ name: "Hero", kind: "frame" });
  expect(frame.children.map((node: { name: string }) => node.name)).toEqual([
    "Hero image",
    "Imported headline"
  ]);
  expect(frame.children[0]).toMatchObject({
    kind: "image",
    content: {
      type: "image",
      asset_id: "figma-asset-figma-image-hero",
      natural_width: 12,
      natural_height: 8,
      fit_mode: "fill"
    }
  });
  const assetResponse = await page.request.get("http://127.0.0.1:4317/assets/figma-asset-figma-image-hero");
  expect(assetResponse.ok()).toBeTruthy();
  expect(assetResponse.headers()["content-type"]).toContain("image/png");
  expect((await assetResponse.body()).equals(image.buffer)).toBeTruthy();
});

test("file panel exports a shared library archive and imports reusable components and tokens", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const commands = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-card",
          name: "Library Card",
          width: 160,
          height: 96,
          fill: "#ffffff"
        },
        { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ]
    }
  });
  expect(commands.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 파일 라이브러리 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${documentId}.layo-library.zip`);
  const archivePath = await download.path();
  if (!archivePath) {
    throw new Error("library archive download path missing");
  }

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  await page.getByTestId("library-archive-upload").setInputFiles(archivePath);
  const review = page.getByTestId("library-archive-review");
  await expect(review).toContainText("가져오기 전 라이브러리 검토");
  await expect(review).toContainText("Card");
  await expect(review).toContainText("Brand / Primary");
  await page.getByTestId("library-archive-prefix").fill("shared");
  await page.getByRole("button", { name: "검토한 라이브러리 가져오기" }).click();
  await expect(page.getByTestId("library-archive-status")).toContainText("라이브러리 가져옴");
  const targetProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${targetProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const targetDocumentId = (await projectResponse.json()).project.currentDocumentId as string;
  const response = await page.request.get(`http://127.0.0.1:4317/files/${targetDocumentId}`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.file.components).toEqual([expect.objectContaining({ id: "shared-component-card", name: "Card" })]);
  expect(payload.file.tokens).toEqual([
    expect.objectContaining({ id: "color-brand-primary", value: "#2563eb" })
  ]);
});

test("file panel sends active team member credentials for library publish and import", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const sourceProjectId = await page.getByTestId("project-switcher").inputValue();

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("tab", { name: "실시간 협업" }).click();
  await page.getByTestId("relay-url").fill("ws://127.0.0.1:65534");
  await page.getByTestId("member-token").fill("editor-member-token");
  await page.getByRole("button", { name: "협업 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");

  await openFilePanel(page);
  const eventStreamRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "GET" &&
      url.pathname === "/libraries/events" &&
      url.searchParams.get("fileId") === documentId
    );
  });
  const sharingRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "PATCH" &&
      url.pathname === `/projects/${sourceProjectId}/sharing`
    );
  });
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");
  const shared = await sharingRequest;
  expect(shared.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });
  const streamed = await eventStreamRequest;
  expect(streamed.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });

  const listRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "GET" &&
      url.pathname === "/libraries" &&
      url.searchParams.has("fileId")
    );
  });
  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  const listed = await listRequest;
  expect(listed.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });

  const publicationRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/libraries"
  );
  await page.getByTestId("library-registry-name").fill("Credentialed Team Kit");
  await page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click();

  const request = await publicationRequest;
  expect(request.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });
  await expect(page.getByTestId("library-registry-status")).toContainText(
    "Credentialed Team Kit 게시됨"
  );

  const postSwitchStreamRequests: Array<{ fileId: string | null; authorization?: string }> = [];
  const postSwitchHttpRequests: Array<{ url: string; authorization?: string }> = [];
  page.on("request", (candidate) => {
    const url = new URL(candidate.url());
    if (candidate.method() === "GET" && url.pathname === "/libraries/events") {
      postSwitchStreamRequests.push({
        fileId: url.searchParams.get("fileId"),
        authorization: candidate.headers().authorization
      });
    }
    if (
      candidate.method() === "GET" &&
      url.pathname !== "/libraries/events" &&
      (url.pathname === "/libraries" || url.pathname.includes("/libraries/"))
    ) {
      postSwitchHttpRequests.push({
        url: url.toString(),
        authorization: candidate.headers().authorization
      });
    }
  });
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-switcher")).not.toHaveValue(sourceProjectId);
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const targetProjectId = await page.getByTestId("project-switcher").inputValue();
  const targetProjectResponse = await page.request.get(
    `http://127.0.0.1:4317/projects/${targetProjectId}`
  );
  expect(targetProjectResponse.ok()).toBeTruthy();
  const targetDocumentId = (await targetProjectResponse.json()).project.currentDocumentId as string;
  await page.waitForTimeout(250);
  expect(postSwitchStreamRequests.filter((request) => request.fileId === targetDocumentId)).toHaveLength(0);
  expect(
    postSwitchHttpRequests
      .filter((request) => request.url.includes(targetDocumentId))
      .filter((request) => request.authorization !== undefined)
  ).toEqual([]);
  const externalSharing = await page.request.patch(
    `http://127.0.0.1:4317/projects/${targetProjectId}/sharing`,
    { data: { mode: "team", teamId: "team-external" } }
  );
  expect(externalSharing.ok()).toBeTruthy();
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByTestId("project-status")).toContainText("저장됨");
  await expect(page.getByTestId("project-sharing-status")).toContainText("team-external");
  await expect(page.getByTestId("project-sharing-status")).not.toContainText("디자인 팀");
  await page.waitForTimeout(250);
  expect(postSwitchStreamRequests.filter((request) => request.fileId === targetDocumentId)).toHaveLength(0);
  const switchedEventStreamRequest = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.method() === "GET" &&
      url.pathname === "/libraries/events" &&
      url.searchParams.get("fileId") === targetDocumentId
    );
  });
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");
  const switchedStream = await switchedEventStreamRequest;
  expect(switchedStream.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });
  const scopedPollingRequest = await page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.method() === "GET" &&
      url.pathname === `/files/${targetDocumentId}/libraries/updates`
    );
  });
  expect(scopedPollingRequest.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });

  const updatesRequest = page.waitForRequest(
    (candidate) =>
      candidate.method() === "GET" &&
      new URL(candidate.url()).pathname.endsWith("/libraries/updates")
  );
  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  const updates = await updatesRequest;
  expect(updates.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });

  const reviewRequest = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" &&
      new URL(candidate.url()).pathname.endsWith("/import/library/registry/review")
  );
  await page.getByTestId(`library-registry-review-${documentId}`).click();
  const reviewed = await reviewRequest;
  expect(reviewed.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });
  await expect(page.getByTestId("library-registry-review")).toContainText(
    "Credentialed Team Kit"
  );

  const importRequest = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" &&
      new URL(candidate.url()).pathname.endsWith("/import/library/registry")
  );
  await page.getByRole("button", { name: "검토한 게시 라이브러리 가져오기" }).click();

  const imported = await importRequest;
  expect(imported.headers()).toMatchObject({
    authorization: "Bearer editor-member-token",
    "x-layo-user-id": "local-user"
  });
  await expect(page.getByTestId("library-registry-status")).toContainText(
    "게시 라이브러리 가져옴"
  );

  await page.getByTestId(`library-registry-token-review-${documentId}`).click();
  await expect(page.getByTestId("library-registry-token-review")).toContainText(
    "Credentialed Team Kit"
  );
  await expect(page.getByTestId("library-registry-list")).toContainText(
    "Credentialed Team Kit"
  );

  const requestsBeforeTeamMismatch = postSwitchHttpRequests.length;
  const mismatchedSharing = await page.request.patch(
    `http://127.0.0.1:4317/projects/${targetProjectId}/sharing`,
    { data: { mode: "team", teamId: "team-external" } }
  );
  expect(mismatchedSharing.ok()).toBeTruthy();
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("team-external");
  await expect(page.getByTestId("library-registry-list")).not.toContainText(
    "Credentialed Team Kit"
  );
  await expect(page.getByTestId("library-registry-review")).toHaveCount(0);
  await expect(page.getByTestId("library-registry-token-review")).toHaveCount(0);
  await page.waitForTimeout(2_250);
  expect(
    postSwitchHttpRequests
      .slice(requestsBeforeTeamMismatch)
      .filter((request) => request.url.includes(targetDocumentId))
      .filter((request) => request.authorization !== undefined)
  ).toEqual([]);

  const reconnectedStreamRequest = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.method() === "GET"
      && url.pathname === "/libraries/events"
      && url.searchParams.get("fileId") === targetDocumentId
    );
  });
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");
  await reconnectedStreamRequest;
  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  await expect(page.getByTestId("library-registry-list")).toContainText(
    "Credentialed Team Kit"
  );

  let markDelayedTokenReviewResponse = () => {};
  const delayedTokenReviewResponse = new Promise<void>((resolve) => {
    markDelayedTokenReviewResponse = resolve;
  });
  let releaseDelayedTokenReviewResponse = () => {};
  const delayedTokenReviewRelease = new Promise<void>((resolve) => {
    releaseDelayedTokenReviewResponse = resolve;
  });
  let markDelayedTokenReviewDelivered = () => {};
  const delayedTokenReviewDelivered = new Promise<void>((resolve) => {
    markDelayedTokenReviewDelivered = resolve;
  });
  const delayedTokenReviewPattern =
    `**/files/${targetDocumentId}/import/library/registry/tokens/review`;
  const delayedTokenReviewRoute = async (route: Route) => {
    const response = await route.fetch();
    markDelayedTokenReviewResponse();
    await delayedTokenReviewRelease;
    await route.fulfill({ response });
    markDelayedTokenReviewDelivered();
  };
  await page.route(delayedTokenReviewPattern, delayedTokenReviewRoute);
  try {
    await page.getByTestId(`library-registry-token-review-${documentId}`).click();
    await delayedTokenReviewResponse;
    const delayedMismatch = await page.request.patch(
      `http://127.0.0.1:4317/projects/${targetProjectId}/sharing`,
      { data: { mode: "team", teamId: "team-external" } }
    );
    expect(delayedMismatch.ok()).toBeTruthy();
    await page.getByRole("button", { name: "이름 저장" }).click();
    await expect(page.getByTestId("project-sharing-status")).toContainText("team-external");
    await expect(page.getByTestId("library-registry-list")).not.toContainText(
      "Credentialed Team Kit"
    );
    releaseDelayedTokenReviewResponse();
    await delayedTokenReviewDelivered;
    await page.waitForTimeout(250);
    await expect(page.getByTestId("library-registry-token-review")).toHaveCount(0);
    await expect(page.getByTestId("library-registry-list")).not.toContainText(
      "Credentialed Team Kit"
    );
  } finally {
    releaseDelayedTokenReviewResponse();
    await page.unroute(delayedTokenReviewPattern, delayedTokenReviewRoute);
  }
});

test("queued library publication aborts after its team access scope changes", async ({ page }) => {
  const { projectId, documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("tab", { name: "실시간 협업" }).click();
  await page.getByTestId("relay-url").fill("ws://127.0.0.1:65534");
  await page.getByTestId("member-token").fill("queued-publication-token");
  await page.getByRole("button", { name: "협업 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await openFilePanel(page);
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");

  let markSnapshotPutStarted = () => {};
  const snapshotPutStarted = new Promise<void>((resolve) => {
    markSnapshotPutStarted = resolve;
  });
  let releaseSnapshotPut = () => {};
  const snapshotPutRelease = new Promise<void>((resolve) => {
    releaseSnapshotPut = resolve;
  });
  let markSnapshotPutCompleted = () => {};
  const snapshotPutCompleted = new Promise<void>((resolve) => {
    markSnapshotPutCompleted = resolve;
  });
  const snapshotPattern = `**/files/${documentId}`;
  const snapshotRoute = async (route: Route) => {
    if (route.request().method() === "PUT") {
      markSnapshotPutStarted();
      await snapshotPutRelease;
      const response = await route.fetch();
      await route.fulfill({ response });
      markSnapshotPutCompleted();
      return;
    }
    await route.continue();
  };
  let markPublicationStarted = () => {};
  const publicationStarted = new Promise<void>((resolve) => {
    markPublicationStarted = resolve;
  });
  let publicationRequests = 0;
  const publicationPattern = "**/libraries";
  const publicationRoute = async (route: Route) => {
    if (route.request().method() === "POST") {
      publicationRequests += 1;
      markPublicationStarted();
    }
    await route.continue();
  };
  await page.route(snapshotPattern, snapshotRoute);
  await page.route(publicationPattern, publicationRoute);

  try {
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await snapshotPutStarted;

    await openFilePanel(page);
    await page.getByTestId("library-registry-name").fill("Stale Scope Kit");
    await page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click();
    const mismatchedSharing = await page.request.patch(
      `http://127.0.0.1:4317/projects/${projectId}/sharing`,
      { data: { mode: "team", teamId: "team-replacement" } }
    );
    expect(mismatchedSharing.ok()).toBeTruthy();
    await page.getByRole("button", { name: "이름 저장" }).click();
    await expect(page.getByTestId("project-sharing-status")).toContainText("team-replacement");

    releaseSnapshotPut();
    await snapshotPutCompleted;
    const stalePublicationStarted = await Promise.race([
      publicationStarted.then(() => true),
      page.waitForTimeout(500).then(() => false)
    ]);
    expect(stalePublicationStarted).toBe(false);
    expect(publicationRequests).toBe(0);
  } finally {
    releaseSnapshotPut();
    await page.unroute(snapshotPattern, snapshotRoute);
    await page.unroute(publicationPattern, publicationRoute);
  }
});

test("library reload cannot supersede an exclusive project creation transition", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const sourceProjectId = await page.getByTestId("project-switcher").inputValue();
  await openFilePanel(page);
  await page.getByTestId("library-registry-name").fill("Transition Guard Kit");
  await page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click();
  await expect(page.getByTestId("library-registry-list")).toContainText("Transition Guard Kit");
  await page.getByTestId(`library-registry-review-${documentId}`).click();
  await expect(page.getByTestId("library-registry-review")).toContainText("Transition Guard Kit");

  let markTargetDocumentGetStarted = () => {};
  const targetDocumentGetStarted = new Promise<void>((resolve) => {
    markTargetDocumentGetStarted = resolve;
  });
  let releaseTargetDocumentGet = () => {};
  const targetDocumentGetRelease = new Promise<void>((resolve) => {
    releaseTargetDocumentGet = resolve;
  });
  let heldTargetDocumentId: string | null = null;
  const targetDocumentRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "GET"
      && /^\/files\/[^/]+$/.test(url.pathname)
      && url.pathname !== `/files/${documentId}`
      && heldTargetDocumentId === null
    ) {
      heldTargetDocumentId = url.pathname.slice("/files/".length);
      markTargetDocumentGetStarted();
      await targetDocumentGetRelease;
    }
    await route.fallback();
  };
  await page.route("**/files/*", targetDocumentRoute);

  let registryImportRequestCount = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST"
      && new URL(request.url()).pathname.endsWith("/import/library/registry")
    ) {
      registryImportRequestCount += 1;
    }
  });

  try {
    const createResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === "POST" && new URL(request.url()).pathname === "/projects";
    });
    await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();
    const targetProject = (await createResponse.json()).project as {
      projectId: string;
      currentDocumentId: string;
    };
    await targetDocumentGetStarted;
    expect(heldTargetDocumentId).toBe(targetProject.currentDocumentId);

    await page.getByRole("button", { name: "검토한 게시 라이브러리 가져오기" }).click();
    await page.waitForTimeout(500);
    releaseTargetDocumentGet();

    await expect(page.getByTestId("project-switcher")).toHaveValue(targetProject.projectId);
    await expect(page.getByTestId("project-switcher")).not.toHaveValue(sourceProjectId);
    expect(registryImportRequestCount).toBe(0);
  } finally {
    releaseTargetDocumentGet();
    await page.unroute("**/files/*", targetDocumentRoute);
  }
});

test("snapshot persistence retries a server conflict and preserves an independent edit", async ({
  page
}) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const initialX = Number(await page.getByTestId("inspector-x").inputValue());

  let markSnapshotPutStarted = () => {};
  const snapshotPutStarted = new Promise<void>((resolve) => {
    markSnapshotPutStarted = resolve;
  });
  let releaseSnapshotPut = () => {};
  const snapshotPutRelease = new Promise<void>((resolve) => {
    releaseSnapshotPut = resolve;
  });
  let markSnapshotPutCompleted = (_status: number) => {};
  const snapshotPutCompleted = new Promise<number>((resolve) => {
    markSnapshotPutCompleted = resolve;
  });
  let heldSnapshotPut = false;
  const snapshotRoute = async (route: Route) => {
    if (route.request().method() === "PUT" && !heldSnapshotPut) {
      heldSnapshotPut = true;
      markSnapshotPutStarted();
      await snapshotPutRelease;
      const response = await route.fetch();
      await route.fulfill({ response });
      markSnapshotPutCompleted(response.status());
      return;
    }
    await route.fallback();
  };
  const snapshotRoutePattern = `**/files/${documentId}`;
  await page.route(snapshotRoutePattern, snapshotRoute);

  const readServerFields = async () => {
    const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
    if (!response.ok()) {
      return null;
    }
    const payload = (await response.json()) as {
      file?: {
        pages?: Array<{
          children?: Array<{
            transform?: { x?: number };
            children?: Array<{ content?: { value?: string } }>;
          }>;
        }>;
      };
    };
    const frame = payload.file?.pages?.[0]?.children?.[0];
    const x = frame?.transform?.x;
    const text = frame?.children?.[0]?.content?.value;
    if (typeof x !== "number" || typeof text !== "string") {
      return null;
    }
    return { x, text };
  };

  try {
    await page.getByTestId("inspector-x").fill("101");
    await snapshotPutStarted;
    const serverGeometry = await page.request.patch(
      `http://127.0.0.1:4317/files/${documentId}/nodes/frame-1/geometry`,
      { data: { x: 202 } }
    );
    expect(serverGeometry.ok()).toBeTruthy();
    const serverText = await page.request.patch(
      `http://127.0.0.1:4317/files/${documentId}/nodes/text-1/text`,
      { data: { value: "snapshot conflict server text" } }
    );
    expect(serverText.ok()).toBeTruthy();
    releaseSnapshotPut();
    expect(await snapshotPutCompleted).toBe(400);

    await expect.poll(readServerFields).toEqual({
      x: 101,
      text: "snapshot conflict server text"
    });
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.keyboard.press("Control+z");
    await expect.poll(readServerFields).toEqual({
      x: initialX,
      text: "snapshot conflict server text"
    });
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(readServerFields).toEqual({
      x: 101,
      text: "snapshot conflict server text"
    });
  } finally {
    releaseSnapshotPut();
    await page.unroute(snapshotRoutePattern, snapshotRoute);
  }
});

test("snapshot persistence keeps the earliest unsaved base behind a queued version save", async ({
  page
}) => {
  const { documentId } = await createProjectFromEmptyState(page);
  let markVersionSaveStarted = () => {};
  const versionSaveStarted = new Promise<void>((resolve) => {
    markVersionSaveStarted = resolve;
  });
  let releaseVersionSave = () => {};
  const versionSaveRelease = new Promise<void>((resolve) => {
    releaseVersionSave = resolve;
  });
  let heldVersionSave = false;
  const versionRoute = async (route: Route) => {
    if (route.request().method() === "POST" && !heldVersionSave) {
      heldVersionSave = true;
      markVersionSaveStarted();
      await versionSaveRelease;
    }
    await route.continue();
  };
  const versionRoutePattern = `**/files/${documentId}/versions`;
  await page.route(versionRoutePattern, versionRoute);

  try {
    await page.getByTestId("file-version-message").fill("저장 큐 점유");
    await page.getByRole("button", { name: "현재 버전 저장" }).click();
    await versionSaveStarted;

    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await page.getByTestId("inspector-y").fill("202");
    releaseVersionSave();

    await expect.poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      const frame = (await response.json()).file.pages[0].children.find(
        (node: { id: string }) => node.id === "frame-1"
      );
      return { x: frame.transform.x, y: frame.transform.y };
    }).toEqual({ x: 101, y: 202 });
  } finally {
    releaseVersionSave();
    await page.unroute(versionRoutePattern, versionRoute);
  }
});

test("file version save seals pre-click snapshots from later edits", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  let markBlockingSaveStarted = () => {};
  const blockingSaveStarted = new Promise<void>((resolve) => {
    markBlockingSaveStarted = resolve;
  });
  let releaseBlockingSave = () => {};
  const blockingSaveRelease = new Promise<void>((resolve) => {
    releaseBlockingSave = resolve;
  });
  let heldBlockingSave = false;
  const versionRoute = async (route: Route) => {
    if (route.request().method() === "POST" && !heldBlockingSave) {
      heldBlockingSave = true;
      markBlockingSaveStarted();
      await blockingSaveRelease;
    }
    await route.continue();
  };
  const versionRoutePattern = `**/files/${documentId}/versions`;
  await page.route(versionRoutePattern, versionRoute);

  try {
    await page.getByTestId("file-version-message").fill("저장 큐 선행 작업");
    await page.getByRole("button", { name: "현재 버전 저장" }).click();
    await blockingSaveStarted;

    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await page.getByTestId("inspector-y").fill("202");
    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await page.getByTestId("file-version-message").fill("클릭 시점 저장");
    await page.getByRole("button", { name: "현재 버전 저장" }).click();
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("303");
    releaseBlockingSave();

    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await expect(page.getByTestId("file-version-status")).toContainText("클릭 시점 저장 저장됨");
    const versionsResponse = await page.request.get(
      `http://127.0.0.1:4317/files/${documentId}/versions`
    );
    expect(versionsResponse.ok()).toBeTruthy();
    const versions = (await versionsResponse.json()).versions as Array<{
      versionId: string;
      message: string;
    }>;
    const clickVersion = versions.find((version) => version.message === "클릭 시점 저장");
    expect(clickVersion).toBeTruthy();
    const clickVersionResponse = await page.request.get(
      `http://127.0.0.1:4317/files/${documentId}/versions/${clickVersion!.versionId}`
    );
    expect(clickVersionResponse.ok()).toBeTruthy();
    const clickFrame = (await clickVersionResponse.json()).version.document.pages[0].children.find(
      (node: { id: string }) => node.id === "frame-1"
    );
    expect({ x: clickFrame.transform.x, y: clickFrame.transform.y }).toEqual({ x: 101, y: 202 });
    await expect.poll(async () => {
      const sourceDocumentResponse = await page.request.get(
        `http://127.0.0.1:4317/files/${documentId}`
      );
      const sourceFrame = (await sourceDocumentResponse.json()).file.pages[0].children.find(
        (node: { id: string }) => node.id === "frame-1"
      );
      return { x: sourceFrame.transform.x, y: sourceFrame.transform.y };
    }).toEqual({ x: 303, y: 202 });
  } finally {
    releaseBlockingSave();
    await page.unroute(versionRoutePattern, versionRoute);
  }
});

test("restore retries retained snapshot epochs after a preflight failure", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("file-version-message").fill("preflight 복원 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("preflight 복원 기준 저장됨");

  let rejectSnapshotPuts = true;
  let snapshotPutAttempts = 0;
  let restoreRequests = 0;
  const snapshotRoutePattern = `**/files/${documentId}`;
  const snapshotRoute = async (route: Route) => {
    if (route.request().method() === "PUT" && rejectSnapshotPuts) {
      snapshotPutAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "snapshot preflight unavailable" })
      });
      return;
    }
    await route.continue();
  };
  const restoreRoutePattern = `**/files/${documentId}/versions/*/restore`;
  const restoreRoute = async (route: Route) => {
    restoreRequests += 1;
    await route.continue();
  };
  await page.route(snapshotRoutePattern, snapshotRoute);
  await page.route(restoreRoutePattern, restoreRoute);

  try {
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await expect(page.getByTestId("inspector-x")).toHaveValue("101");
    await expect.poll(() => snapshotPutAttempts).toBe(1);

    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await page.getByRole("button", { name: "preflight 복원 기준 복원" }).click();
    await expect.poll(() => snapshotPutAttempts).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("file-version-status")).toContainText(
      "snapshot preflight unavailable"
    );
    expect(restoreRequests).toBe(0);

    rejectSnapshotPuts = false;
    await page.getByRole("button", { name: "preflight 복원 기준 복원" }).click();
    await expect(page.getByTestId("file-version-status")).toContainText(
      "preflight 복원 기준 복원됨"
    );
    expect(restoreRequests).toBe(1);
    const restoredDocumentResponse = await page.request.get(
      `http://127.0.0.1:4317/files/${documentId}`
    );
    const restoredFrame = (await restoredDocumentResponse.json()).file.pages[0].children.find(
      (node: { id: string }) => node.id === "frame-1"
    );
    expect(restoredFrame.transform.x).toBe(120);
  } finally {
    await page.unroute(snapshotRoutePattern, snapshotRoute);
    await page.unroute(restoreRoutePattern, restoreRoute);
  }
});

test("project duplication seals click-time persistence and blocks edits until copying finishes", async ({ page }) => {
  const { projectId: sourceProjectId, documentId } = await createProjectFromEmptyState(page);
  let markVersionSaveStarted = () => {};
  const versionSaveStarted = new Promise<void>((resolve) => {
    markVersionSaveStarted = resolve;
  });
  let releaseVersionSave = () => {};
  const versionSaveRelease = new Promise<void>((resolve) => {
    releaseVersionSave = resolve;
  });
  let heldVersionSave = false;
  const versionRoute = async (route: Route) => {
    if (route.request().method() === "POST" && !heldVersionSave) {
      heldVersionSave = true;
      markVersionSaveStarted();
      await versionSaveRelease;
    }
    await route.continue();
  };
  const versionRoutePattern = `**/files/${documentId}/versions`;
  await page.route(versionRoutePattern, versionRoute);

  try {
    await page.getByTestId("file-version-message").fill("복제 전 저장 큐 점유");
    await page.getByRole("button", { name: "현재 버전 저장" }).click();
    await versionSaveStarted;

    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await page.getByTestId("inspector-y").fill("202");

    const duplicateRequestStarted = page.waitForRequest(
      (request) =>
        request.method() === "POST"
        && request.url().endsWith(`/projects/${sourceProjectId}/duplicate`)
    );
    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("303");
    const duplicateStartedBeforePersistence = await Promise.race([
      duplicateRequestStarted.then(() => true),
      page.waitForTimeout(1_000).then(() => false)
    ]);
    releaseVersionSave();
    expect(duplicateStartedBeforePersistence).toBe(false);

    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await expect(page.getByTestId("project-status")).toContainText("프로젝트 복제됨");
    const duplicatedProjectId = await page.getByTestId("project-switcher").inputValue();
    expect(duplicatedProjectId).not.toBe(sourceProjectId);

    const duplicatedProjectResponse = await page.request.get(
      `http://127.0.0.1:4317/projects/${duplicatedProjectId}`
    );
    expect(duplicatedProjectResponse.ok()).toBeTruthy();
    const duplicatedDocumentId = (await duplicatedProjectResponse.json()).project
      .currentDocumentId as string;
    const duplicatedDocumentResponse = await page.request.get(
      `http://127.0.0.1:4317/files/${duplicatedDocumentId}`
    );
    expect(duplicatedDocumentResponse.ok()).toBeTruthy();
    const duplicatedFrame = (await duplicatedDocumentResponse.json()).file.pages[0].children.find(
      (node: { id: string }) => node.id === "frame-1"
    );
    expect({ x: duplicatedFrame.transform.x, y: duplicatedFrame.transform.y }).toEqual({
      x: 101,
      y: 202
    });
    await expect.poll(async () => {
      const sourceDocumentResponse = await page.request.get(
        `http://127.0.0.1:4317/files/${documentId}`
      );
      const sourceFrame = (await sourceDocumentResponse.json()).file.pages[0].children.find(
        (node: { id: string }) => node.id === "frame-1"
      );
      return { x: sourceFrame.transform.x, y: sourceFrame.transform.y };
    }).toEqual({ x: 101, y: 202 });
  } finally {
    releaseVersionSave();
    await page.unroute(versionRoutePattern, versionRoute);
  }
});

test("project duplication aborts when its click-time snapshot cannot persist", async ({ page }) => {
  const { projectId: sourceProjectId, documentId } = await createProjectFromEmptyState(page);
  let rejectSnapshotPuts = true;
  let snapshotPutAttempts = 0;
  let duplicateRequests = 0;
  const snapshotRoutePattern = `**/files/${documentId}`;
  const snapshotRoute = async (route: Route) => {
    if (route.request().method() === "PUT" && rejectSnapshotPuts) {
      snapshotPutAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "snapshot unavailable" })
      });
      return;
    }
    await route.continue();
  };
  const duplicateRoutePattern = `**/projects/${sourceProjectId}/duplicate`;
  const duplicateRoute = async (route: Route) => {
    duplicateRequests += 1;
    await route.continue();
  };
  await page.route(snapshotRoutePattern, snapshotRoute);
  await page.route(duplicateRoutePattern, duplicateRoute);

  try {
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await expect.poll(() => snapshotPutAttempts).toBe(1);

    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
    await expect.poll(() => snapshotPutAttempts).toBeGreaterThanOrEqual(2);
    expect(duplicateRequests).toBe(0);
    await expect(page.getByTestId("project-switcher")).toHaveValue(sourceProjectId);
    await expect(page.getByTestId("project-status")).toContainText("snapshot unavailable");

    rejectSnapshotPuts = false;
    await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
    await expect(page.getByTestId("project-status")).toContainText("프로젝트 복제됨");
    expect(duplicateRequests).toBe(1);
    const duplicatedProjectId = await page.getByTestId("project-switcher").inputValue();
    expect(duplicatedProjectId).not.toBe(sourceProjectId);
    const duplicatedProjectResponse = await page.request.get(
      `http://127.0.0.1:4317/projects/${duplicatedProjectId}`
    );
    const duplicatedDocumentId = (await duplicatedProjectResponse.json()).project
      .currentDocumentId as string;
    const duplicatedDocumentResponse = await page.request.get(
      `http://127.0.0.1:4317/files/${duplicatedDocumentId}`
    );
    const duplicatedFrame = (await duplicatedDocumentResponse.json()).file.pages[0].children.find(
      (node: { id: string }) => node.id === "frame-1"
    );
    expect(duplicatedFrame.transform.x).toBe(101);
  } finally {
    await page.unroute(snapshotRoutePattern, snapshotRoute);
    await page.unroute(duplicateRoutePattern, duplicateRoute);
  }
});

test("project navigation refuses to abandon an unpersisted source snapshot", async ({ page }) => {
  const { projectId: sourceProjectId, documentId } = await createProjectFromEmptyState(page);
  const targetProjectResponse = await page.request.post("http://127.0.0.1:4317/projects", {
    data: { name: "전환 대상 프로젝트", documentName: "전환 대상 문서" }
  });
  expect(targetProjectResponse.ok()).toBeTruthy();
  const targetProjectId = (await targetProjectResponse.json()).project.projectId as string;
  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(sourceProjectId);

  let rejectSnapshotPuts = true;
  let snapshotPutAttempts = 0;
  const snapshotRoutePattern = "**/files/**";
  const snapshotRoute = async (route: Route) => {
    if (
      route.request().method() === "PUT"
      && new URL(route.request().url()).pathname === `/files/${documentId}`
      && rejectSnapshotPuts
    ) {
      snapshotPutAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "navigation snapshot unavailable" })
      });
      return;
    }
    await route.continue();
  };
  await page.route(snapshotRoutePattern, snapshotRoute);

  try {
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await expect(page.getByTestId("inspector-x")).toHaveValue("101");
    await expect.poll(() => snapshotPutAttempts).toBe(1);

    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await page.getByTestId("project-switcher").selectOption(targetProjectId);
    await expect(page.getByTestId("project-status")).toContainText(
      "navigation snapshot unavailable"
    );
    await expect(page.getByTestId("project-switcher")).toHaveValue(sourceProjectId);

    rejectSnapshotPuts = false;
    await page.getByTestId("project-switcher").selectOption(targetProjectId);
    await expect(page.getByTestId("project-status")).toContainText("불러옴");
    await page.getByTestId("project-switcher").selectOption(sourceProjectId);
    await expect(page.getByTestId("project-status")).toContainText("불러옴");
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(page.getByTestId("inspector-x")).toHaveValue("101");
  } finally {
    await page.unroute(snapshotRoutePattern, snapshotRoute);
  }
});

test("project navigation blocks source edits after transition admission", async ({ page }) => {
  const { projectId: sourceProjectId, documentId } = await createProjectFromEmptyState(page);
  const targetProjectResponse = await page.request.post("http://127.0.0.1:4317/projects", {
    data: { name: "전환 잠금 대상", documentName: "전환 잠금 대상 문서" }
  });
  expect(targetProjectResponse.ok()).toBeTruthy();
  const targetProject = (await targetProjectResponse.json()).project as {
    projectId: string;
    currentDocumentId: string;
  };
  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(sourceProjectId);

  let markTargetDocumentPending = () => {};
  const targetDocumentPending = new Promise<void>((resolve) => {
    markTargetDocumentPending = resolve;
  });
  let releaseTargetDocument = () => {};
  const targetDocumentRelease = new Promise<void>((resolve) => {
    releaseTargetDocument = resolve;
  });
  const targetDocumentPattern = `**/files/${targetProject.currentDocumentId}`;
  const targetDocumentRoute = async (route: Route) => {
    if (route.request().method() === "GET") {
      markTargetDocumentPending();
      await targetDocumentRelease;
    }
    await route.continue();
  };
  let sourcePutAttempts = 0;
  const sourceDocumentPattern = `**/files/${documentId}`;
  const sourceDocumentRoute = async (route: Route) => {
    if (route.request().method() === "PUT") {
      sourcePutAttempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "transition edit must not persist" })
      });
      return;
    }
    await route.continue();
  };
  await page.route(targetDocumentPattern, targetDocumentRoute);
  await page.route(sourceDocumentPattern, sourceDocumentRoute);

  try {
    await page.getByTestId("project-switcher").selectOption(targetProject.projectId);
    await targetDocumentPending;
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByTestId("inspector-x").fill("101");
    await page.waitForTimeout(250);
    expect(sourcePutAttempts).toBe(0);

    releaseTargetDocument();
    await openFilePanel(page);
    await expect(page.getByTestId("project-status")).toContainText("전환 잠금 대상 불러옴");
    await page.getByTestId("project-switcher").selectOption(sourceProjectId);
    await expect(page.getByTestId("project-status")).toContainText("불러옴");
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(page.getByTestId("inspector-x")).toHaveValue("120");
  } finally {
    releaseTargetDocument();
    await page.unroute(targetDocumentPattern, targetDocumentRoute);
    await page.unroute(sourceDocumentPattern, sourceDocumentRoute);
  }
});

test("DTCG import cannot apply or restart across a project navigation transition", async ({ page }) => {
  const { projectId: sourceProjectId, documentId } = await createProjectFromEmptyState(page);
  const targetProjectResponse = await page.request.post("http://127.0.0.1:4317/projects", {
    data: { name: "토큰 전환 대상", documentName: "토큰 전환 대상 문서" }
  });
  expect(targetProjectResponse.ok()).toBeTruthy();
  const targetProject = (await targetProjectResponse.json()).project as {
    projectId: string;
    currentDocumentId: string;
  };
  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(sourceProjectId);
  await page.getByTestId("dtcg-token-json").fill(JSON.stringify({
    global: {
      Transition: {
        Token: { $type: "color", $value: "#f97316" }
      }
    }
  }));

  let markTokenResponsePending = () => {};
  const tokenResponsePending = new Promise<void>((resolve) => {
    markTokenResponsePending = resolve;
  });
  let releaseTokenResponse = () => {};
  const tokenResponseRelease = new Promise<void>((resolve) => {
    releaseTokenResponse = resolve;
  });
  let tokenImportRequests = 0;
  const tokenImportPattern = `**/files/${documentId}/tokens/dtcg`;
  const tokenImportRoute = async (route: Route) => {
    if (route.request().method() === "PUT") {
      tokenImportRequests += 1;
      const response = await route.fetch();
      markTokenResponsePending();
      await tokenResponseRelease;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  };
  let markTargetDocumentPending = () => {};
  const targetDocumentPending = new Promise<void>((resolve) => {
    markTargetDocumentPending = resolve;
  });
  let releaseTargetDocument = () => {};
  const targetDocumentRelease = new Promise<void>((resolve) => {
    releaseTargetDocument = resolve;
  });
  const targetDocumentPattern = `**/files/${targetProject.currentDocumentId}`;
  const targetDocumentRoute = async (route: Route) => {
    if (route.request().method() === "GET") {
      markTargetDocumentPending();
      await targetDocumentRelease;
    }
    await route.continue();
  };
  await page.route(tokenImportPattern, tokenImportRoute);
  await page.route(targetDocumentPattern, targetDocumentRoute);

  try {
    await page.getByRole("button", { name: "토큰 가져오기" }).click();
    await tokenResponsePending;
    await page.getByTestId("project-switcher").selectOption(targetProject.projectId);
    releaseTokenResponse();
    await targetDocumentPending;

    await expect(page.getByTestId("dtcg-token-status")).not.toContainText("토큰 가져옴");
    const importButton = page.getByRole("button", { name: "토큰 가져오기" });
    await expect(importButton).toBeDisabled();
    await importButton.evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.disabled = false;
      button.click();
    });
    await page.waitForTimeout(250);
    expect(tokenImportRequests).toBe(1);

    releaseTargetDocument();
    await openFilePanel(page);
    await expect(page.getByTestId("project-status")).toContainText("토큰 전환 대상 불러옴");
    await expect(page.getByTestId("project-switcher")).toHaveValue(targetProject.projectId);
    const targetDocumentResponse = await page.request.get(
      `http://127.0.0.1:4317/files/${targetProject.currentDocumentId}`
    );
    expect((await targetDocumentResponse.json()).file.tokens ?? []).toEqual([]);
  } finally {
    releaseTokenResponse();
    releaseTargetDocument();
    await page.unroute(tokenImportPattern, tokenImportRoute);
    await page.unroute(targetDocumentPattern, targetDocumentRoute);
  }
});

test("snapshot-dependent archives and publication wait for click-time persistence", async ({ page }) => {
  const { projectId, documentId } = await createProjectFromEmptyState(page);
  type SnapshotGate = {
    started: Promise<void>;
    markStarted: () => void;
    release: () => void;
    releaseGate: Promise<void>;
    held: boolean;
  };
  let activeGate: SnapshotGate | null = null;
  const createSnapshotGate = () => {
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let release = () => {};
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gate = { started, markStarted, release, releaseGate, held: false };
    activeGate = gate;
    return gate;
  };
  const snapshotRoutePattern = `**/files/${documentId}`;
  const snapshotRoute = async (route: Route) => {
    const gate = activeGate;
    if (route.request().method() === "PUT" && gate && !gate.held) {
      gate.held = true;
      gate.markStarted();
      await gate.releaseGate;
      if (activeGate === gate) {
        activeGate = null;
      }
    }
    await route.continue();
  };
  await page.route(snapshotRoutePattern, snapshotRoute);

  const requestWaitsForGate = async (
    gate: SnapshotGate,
    requestPromise: Promise<unknown>,
    action: () => Promise<void>
  ) => {
    await action();
    const startedBeforeRelease = await Promise.race([
      requestPromise.then(() => true),
      page.waitForTimeout(300).then(() => false)
    ]);
    gate.release();
    expect(startedBeforeRelease).toBe(false);
    await requestPromise;
  };

  try {
    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();

    const fileArchiveGate = createSnapshotGate();
    await page.getByTestId("inspector-x").fill("101");
    await fileArchiveGate.started;
    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    const fileArchiveRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === `/files/${documentId}/export/archive`
    );
    const fileArchiveDownload = page.waitForEvent("download");
    await requestWaitsForGate(fileArchiveGate, fileArchiveRequest, () =>
      page.getByRole("button", { name: "현재 파일 아카이브 내보내기" }).click()
    );
    await fileArchiveDownload;

    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    const libraryArchiveGate = createSnapshotGate();
    await page.getByTestId("inspector-y").fill("202");
    await libraryArchiveGate.started;
    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    const libraryArchiveRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === `/files/${documentId}/export/library`
    );
    const libraryArchiveDownload = page.waitForEvent("download");
    await requestWaitsForGate(libraryArchiveGate, libraryArchiveRequest, () =>
      page.getByRole("button", { name: "현재 파일 라이브러리 내보내기" }).click()
    );
    await libraryArchiveDownload;

    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    const publicationGate = createSnapshotGate();
    await page.getByTestId("inspector-x").fill("303");
    await publicationGate.started;
    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    await page.getByTestId("library-registry-name").fill("클릭 시점 라이브러리");
    const publicationRequest = page.waitForRequest(
      (request) => request.method() === "POST" && new URL(request.url()).pathname === "/libraries"
    );
    await requestWaitsForGate(publicationGate, publicationRequest, () =>
      page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click()
    );
    await expect(page.getByTestId("library-registry-status")).toContainText(
      "클릭 시점 라이브러리 게시됨"
    );

    await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    const projectArchiveGate = createSnapshotGate();
    await page.getByTestId("inspector-y").fill("404");
    await projectArchiveGate.started;
    await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
    const projectArchiveRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === `/projects/${projectId}/export/archive`
    );
    const projectArchiveDownload = page.waitForEvent("download");
    await requestWaitsForGate(projectArchiveGate, projectArchiveRequest, () =>
      page.getByRole("button", { name: "현재 프로젝트 아카이브 내보내기" }).click()
    );
    await projectArchiveDownload;
  } finally {
    activeGate?.release();
    await page.unroute(snapshotRoutePattern, snapshotRoute);
  }
});

test("file panel clears protected library state when stream authorization ends", async ({ page }) => {
  let releaseAuthorization!: () => void;
  const authorizationGate = new Promise<void>((resolve) => {
    releaseAuthorization = resolve;
  });
  let streamRequests = 0;
  await page.route("**/libraries/events**", async (route) => {
    streamRequests += 1;
    if (streamRequests === 1) {
      await authorizationGate;
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          "event: library-registry-authorization-ended",
          'data: {"code":"credential_inactive"}',
          "",
          ""
        ].join("\n")
      });
      return;
    }
    await route.fulfill({ status: 401, body: "unauthorized" });
  });

  const { documentId } = await createProjectFromEmptyState(page);
  await openFilePanel(page);
  await page.getByTestId("library-registry-name").fill("Protected Team Kit");
  await page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click();
  await expect(page.getByTestId("library-registry-list")).toContainText("Protected Team Kit");
  await page.getByTestId(`library-registry-review-${documentId}`).click();
  await expect(page.getByTestId("library-registry-review")).toContainText("Protected Team Kit");

  let releaseRegistryRefresh!: () => void;
  const registryRefreshGate = new Promise<void>((resolve) => {
    releaseRegistryRefresh = resolve;
  });
  let registryRefreshRequests = 0;
  await page.route("**/libraries?**", async (route) => {
    if (new URL(route.request().url()).pathname !== "/libraries") {
      await route.continue();
      return;
    }
    registryRefreshRequests += 1;
    const response = await route.fetch();
    await registryRefreshGate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  await expect.poll(() => registryRefreshRequests).toBe(1);

  releaseAuthorization();

  await expect(page.getByTestId("library-registry-status")).toContainText(
    "팀 인증이 만료되었습니다. 새 멤버 토큰으로 다시 연결해 주세요."
  );
  releaseRegistryRefresh();
  await expect(page.getByTestId("library-registry-list")).not.toContainText(
    "Protected Team Kit"
  );
  await expect(page.getByTestId("library-registry-review")).toHaveCount(0);
  await expect(page.getByTestId("library-registry-status")).toContainText(
    "팀 인증이 만료되었습니다. 새 멤버 토큰으로 다시 연결해 주세요."
  );
  await page.waitForTimeout(1_250);
  expect(streamRequests).toBe(1);
});

test("team panel replaces an expired member token without recreating the team", async ({ page }) => {
  const streamTokens: string[] = [];
  let expiredTokenRequests = 0;
  await page.route("**/libraries/events**", async (route) => {
    const authorization = route.request().headers().authorization;
    if (!authorization) {
      await route.continue();
      return;
    }
    streamTokens.push(authorization);
    if (authorization === "Bearer expired-member-token") {
      expiredTokenRequests += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        authorization === "Bearer expired-member-token" && expiredTokenRequests === 1
          ? [
              "event: library-registry-authorization-ended",
              'data: {"code":"credential_inactive"}',
              "",
              ""
            ].join("\n")
          : [
              "event: library-registry-ready",
              'data: {"ok":true}',
              "",
              ""
            ].join("\n")
    });
  });

  await createProjectFromEmptyState(page);
  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await expect(page.getByTestId("member-token")).toHaveCount(0);
  await openFilePanel(page);
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("디자인 팀");
  await page.getByRole("tab", { name: "팀 설정" }).click();

  await page.getByTestId("member-token").fill("expired-member-token");
  await page.getByRole("button", { name: "멤버 토큰 적용" }).click();
  await expect(page.getByTestId("team-member-token-status")).toContainText(
    "팀 인증이 만료되었습니다"
  );

  const applyToken = page.getByRole("button", { name: "멤버 토큰 적용" });
  await expect(applyToken).toBeEnabled();
  await applyToken.click();
  await expect(page.getByTestId("team-member-token-status")).toContainText(
    "팀 인증 다시 연결됨"
  );
  await expect.poll(() => expiredTokenRequests).toBe(2);

  await page.getByTestId("member-token").fill("rotated-member-token");
  await page.getByRole("button", { name: "멤버 토큰 적용" }).click();

  await expect(page.getByTestId("team-member-token-status")).toContainText(
    "팀 인증 다시 연결됨"
  );
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await expect.poll(() => streamTokens).toContain("Bearer rotated-member-token");
});

test("file panel publishes imports and updates a shared library registry item", async ({ page }) => {
  await page.addInitScript(() => {
    const instrumentedWindow = window as Window & {
      __layoLibraryRegistryStreamUrls?: string[];
      __layoSuppressedLibraryRegistryPolling?: boolean;
    };
    const nativeFetch = window.fetch.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);

    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 2_000) {
        instrumentedWindow.__layoSuppressedLibraryRegistryPolling = true;
        return 0;
      }
      return nativeSetInterval(handler, timeout, ...args);
    }) as typeof window.setInterval;

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url;
      const parsedUrl = new URL(url, window.location.href);
      if (parsedUrl.pathname === "/libraries/events") {
        instrumentedWindow.__layoLibraryRegistryStreamUrls = [
          ...(instrumentedWindow.__layoLibraryRegistryStreamUrls ?? []),
          parsedUrl.toString()
        ];
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });

  const { documentId } = await createProjectFromEmptyState(page);
  const commands = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-card",
          name: "Library Card",
          width: 160,
          height: 96,
          fill: "#ffffff"
        },
        { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ]
    }
  });
  expect(commands.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("library-registry-name").fill("Team Kit");
  await page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("Team Kit 게시됨");
  await expect(page.getByTestId("library-registry-list")).toContainText("Team Kit");
  await expect(page.getByTestId("library-registry-list")).toContainText("컴포넌트 1개");

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  await expect(page.getByTestId("library-registry-list")).toContainText("Team Kit");
  await page.getByTestId(`library-registry-review-${documentId}`).click();
  await expect(page.getByTestId("library-registry-review")).toContainText("게시된 라이브러리 검토");
  await expect(page.getByTestId("library-registry-review")).toContainText("Card");
  await expect(page.getByTestId("library-registry-review")).toContainText("Brand / Primary");
  await page.getByTestId("library-registry-prefix").fill("team");
  await page.getByRole("button", { name: "검토한 게시 라이브러리 가져오기" }).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("게시 라이브러리 가져옴");
  await expect(page.getByTestId("library-registry-updates")).toContainText("적용할 업데이트 없음");
  const targetProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${targetProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const targetDocumentId = (await projectResponse.json()).project.currentDocumentId as string;
  await page.waitForFunction(
    ({ targetDocumentId: expectedDocumentId }) => {
      const instrumentedWindow = window as Window & {
        __layoLibraryRegistryStreamUrls?: string[];
        __layoSuppressedLibraryRegistryPolling?: boolean;
      };
      return (
        instrumentedWindow.__layoSuppressedLibraryRegistryPolling === true &&
        (instrumentedWindow.__layoLibraryRegistryStreamUrls ?? []).some((url) => {
          const parsedUrl = new URL(url, window.location.href);
          return (
            parsedUrl.pathname === "/libraries/events" &&
            parsedUrl.searchParams.get("fileId") === expectedDocumentId
          );
        })
      );
    },
    { targetDocumentId }
  );
  const updateCommands = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-badge",
          name: "Library Badge",
          width: 80,
          height: 32,
          fill: "#2563eb"
        },
        { type: "create_component", nodeId: "library-badge", componentId: "component-badge", name: "Badge" }
      ]
    }
  });
  expect(updateCommands.ok()).toBeTruthy();
  const republished = await page.request.post("http://127.0.0.1:4317/libraries", {
    data: { fileId: documentId, libraryId: documentId, name: "Team Kit" }
  });
  expect(republished.ok()).toBeTruthy();

  await expect(page.getByTestId("library-registry-updates")).toContainText("Team Kit 업데이트 가능");
  await page.getByTestId(`library-registry-update-${documentId}`).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("Team Kit 업데이트 적용됨");

  const response = await page.request.get(`http://127.0.0.1:4317/files/${targetDocumentId}`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.file.components).toEqual([
    expect.objectContaining({ id: "team-component-card", name: "Card" }),
    expect.objectContaining({ id: "team-component-badge", name: "Badge" })
  ]);
  expect(payload.file.tokens).toEqual([
    expect.objectContaining({ id: "color-brand-primary", value: "#2563eb" })
  ]);
});

test("file panel scopes published registry libraries to matching project teams", async ({ page }) => {
  const { projectId, documentId } = await createProjectFromEmptyState(page);
  const sharedSource = await page.request.patch(`http://127.0.0.1:4317/projects/${projectId}/sharing`, {
    data: { mode: "team", teamId: "team-alpha" }
  });
  expect(sharedSource.ok()).toBeTruthy();
  const commands = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: { id: "color-brand-primary", name: "Brand / Primary", type: "color", value: "#2563eb" }
        },
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "library-card",
          name: "Library Card",
          width: 160,
          height: 96,
          fill: "#ffffff"
        },
        { type: "set_fill_token", nodeId: "library-card", tokenId: "color-brand-primary" },
        { type: "create_component", nodeId: "library-card", componentId: "component-card", name: "Card" }
      ]
    }
  });
  expect(commands.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("library-registry-name").fill("Team Kit");
  await page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("Team Kit 게시됨");
  await expect(page.getByTestId("library-registry-list")).toContainText("Team Kit");

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const targetProjectId = await page.getByTestId("project-switcher").inputValue();
  const sharedOtherTeam = await page.request.patch(`http://127.0.0.1:4317/projects/${targetProjectId}/sharing`, {
    data: { mode: "team", teamId: "team-beta" }
  });
  expect(sharedOtherTeam.ok()).toBeTruthy();

  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  await expect(page.getByTestId("library-registry-list")).toContainText("게시된 라이브러리 없음");
  await expect(page.getByTestId("library-registry-list")).not.toContainText("Team Kit");

  const sharedSameTeam = await page.request.patch(`http://127.0.0.1:4317/projects/${targetProjectId}/sharing`, {
    data: { mode: "team", teamId: "team-alpha" }
  });
  expect(sharedSameTeam.ok()).toBeTruthy();

  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  await expect(page.getByTestId("library-registry-list")).toContainText("Team Kit");
  await page.getByTestId(`library-registry-review-${documentId}`).click();
  await expect(page.getByTestId("library-registry-review")).toContainText("Card");
});

test("file panel reviews and imports shared library token bundles", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const sourceTokens = await page.request.put(`http://127.0.0.1:4317/files/${documentId}/tokens/dtcg`, {
    data: {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeTokenSets: ["base", "light"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#2563eb"
          }
        }
      },
      light: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#1d4ed8"
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
    }
  });
  expect(sourceTokens.ok()).toBeTruthy();
  const sourceTheme = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-brand",
            name: "Brand Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["base", "light", "dark"]
          }
        }
      ]
    }
  });
  expect(sourceTheme.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByTestId("library-registry-name").fill("Team Kit");
  await page.getByRole("button", { name: "현재 파일 라이브러리 게시" }).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("Team Kit 게시됨");

  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const targetProjectId = await page.getByTestId("project-switcher").inputValue();
  const projectResponse = await page.request.get(`http://127.0.0.1:4317/projects/${targetProjectId}`);
  expect(projectResponse.ok()).toBeTruthy();
  const targetDocumentId = (await projectResponse.json()).project.currentDocumentId as string;
  const legacyTokens = await page.request.put(`http://127.0.0.1:4317/files/${targetDocumentId}/tokens/dtcg`, {
    data: {
      $metadata: {
        tokenSetOrder: ["legacy"],
        activeTokenSets: ["legacy"]
      },
      legacy: {
        Legacy: {
          Primary: {
            $type: "color",
            $value: "#111827"
          }
        }
      }
    }
  });
  expect(legacyTokens.ok()).toBeTruthy();
  const legacyTheme = await page.request.post(`http://127.0.0.1:4317/files/${targetDocumentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-legacy",
            name: "Legacy Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["legacy"]
          }
        }
      ]
    }
  });
  expect(legacyTheme.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("library-registry-list")).toContainText("Team Kit");
  await page.getByTestId(`library-registry-token-review-${documentId}`).click();
  const review = page.getByTestId("library-registry-token-review");
  await expect(review).toContainText("게시 라이브러리 토큰 검토");
  await expect(review).toContainText("토큰 3개");
  await expect(review).toContainText("세트 3개");
  await expect(review).toContainText("테마 1개");
  await expect(review).toContainText("현재 토큰 1개 교체");
  await expect(review).toContainText("Brand Theme");
  await page.getByRole("button", { name: "게시 라이브러리 토큰 가져오기" }).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("Team Kit 토큰 가져옴");

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${targetDocumentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const payload = await fileResponse.json();
  expect(payload.file.tokens.map((token: { id: string }) => token.id)).toEqual([
    "color-base-brand-primary",
    "color-light-brand-primary",
    "color-dark-brand-primary"
  ]);
  expect(payload.file.token_sets).toEqual([
    { id: "base", name: "base", enabled: true },
    { id: "light", name: "light", enabled: true },
    { id: "dark", name: "dark", enabled: false }
  ]);
  expect(payload.file.token_themes).toEqual([
    {
      id: "theme-brand",
      name: "Brand Theme",
      group: "mode",
      enabled: true,
      token_set_ids: ["base", "light", "dark"]
    }
  ]);

  const updatedSourceTokens = await page.request.put(`http://127.0.0.1:4317/files/${documentId}/tokens/dtcg`, {
    data: {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark", "contrast"],
        activeTokenSets: ["base", "dark"]
      },
      base: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#0ea5e9"
          }
        }
      },
      light: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#38bdf8"
          }
        }
      },
      dark: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#bae6fd"
          }
        }
      },
      contrast: {
        Brand: {
          Primary: {
            $type: "color",
            $value: "#082f49"
          }
        }
      }
    }
  });
  expect(updatedSourceTokens.ok()).toBeTruthy();
  const updatedSourceTheme = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "upsert_token_theme",
          tokenTheme: {
            id: "theme-brand",
            name: "Brand Theme",
            group: "mode",
            enabled: true,
            token_set_ids: ["base", "dark"]
          }
        }
      ]
    }
  });
  expect(updatedSourceTheme.ok()).toBeTruthy();
  const republished = await page.request.post("http://127.0.0.1:4317/libraries", {
    data: { fileId: documentId, name: "Team Kit" }
  });
  expect(republished.ok()).toBeTruthy();

  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  await expect(page.getByTestId("library-registry-token-updates")).toContainText("Team Kit 토큰 업데이트 가능");
  await page.getByTestId(`library-registry-token-update-${documentId}`).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("Team Kit 토큰 업데이트 적용됨");

  const updatedFileResponse = await page.request.get(`http://127.0.0.1:4317/files/${targetDocumentId}`);
  expect(updatedFileResponse.ok()).toBeTruthy();
  const updatedPayload = await updatedFileResponse.json();
  expect(updatedPayload.file.tokens.map((token: { id: string; value: string }) => [token.id, token.value])).toEqual([
    ["color-base-brand-primary", "#0ea5e9"],
    ["color-light-brand-primary", "#38bdf8"],
    ["color-dark-brand-primary", "#bae6fd"],
    ["color-contrast-brand-primary", "#082f49"]
  ]);
  expect(updatedPayload.file.token_themes).toEqual([
    {
      id: "theme-brand",
      name: "Brand Theme",
      group: "mode",
      enabled: true,
      token_set_ids: ["base", "dark"]
    }
  ]);
});

test("inspector dev panel shows selected layer handoff specs and code", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  await expect(page.getByTestId("dev-panel")).toBeVisible();
  await expect(page.getByTestId("dev-panel-status")).toContainText("코드 내보내기");
  await expect(page.getByTestId("dev-panel-selected-node")).toContainText("헤드라인");
  await expect(page.getByTestId("dev-panel-selected-node")).toContainText("text-1");
  await expect(page.getByTestId("dev-panel-specs")).toContainText("W 260");
  await expect(page.getByTestId("dev-panel-specs")).toContainText("H 48");
  await expect(page.getByTestId("dev-panel-specs")).toContainText("#111827");
  await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("크기/위치");
  await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("260 x 48");
  await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("콘텐츠");
  await expect(page.getByTestId("dev-panel-ready-annotations")).toContainText("\"Layo\"");
  await expect(page.getByTestId("dev-panel-css")).toContainText(".node-text-1");
  await expect(page.getByTestId("dev-panel-css")).toContainText("font-size");
  await expect(page.getByTestId("dev-panel-html")).toContainText('data-node-id="text-1"');
  await expect(page.getByTestId("dev-panel-structure")).toContainText('"id": "text-1"');

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("dev-panel-selected-node")).toContainText("랜딩 프레임");
  await expect(page.getByTestId("dev-panel-selected-node")).toContainText("frame-1");
  await expect(page.getByTestId("dev-panel-css")).toContainText(".node-frame-1");
  await expect(page.getByTestId("dev-panel-html")).toContainText('data-node-id="frame-1"');
  await expect(page.getByTestId("dev-panel-structure")).toContainText('"id": "frame-1"');
});

test("inspector dev panel shows repo code mappings for selected component instances", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5173"
  });
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  const variants = await page.request.put(
    `http://127.0.0.1:4317/files/${documentId}/components/component-card/variants`,
    {
      data: {
        variants: [
          { id: "card-flat", name: "Flat", properties: [{ name: "surface", value: "flat" }] },
          { id: "card-elevated", name: "Elevated", properties: [{ name: "surface", value: "elevated" }] }
        ]
      }
    }
  );
  expect(variants.ok()).toBeTruthy();

  const instance = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/component-instances`, {
    data: {
      parentId: "page-1",
      definitionId: "component-card",
      instanceId: "instance-card",
      x: 520,
      y: 140
    }
  });
  expect(instance.ok()).toBeTruthy();

  const mapping = await page.request.put(`http://127.0.0.1:4317/files/${documentId}/code-mappings`, {
    data: {
      mappings: [
        {
          id: "mapping-card",
          component_id: "component-card",
          package_name: "@repo/ui",
          import_path: "@repo/ui/card",
          export_name: "Card",
          import_mode: "named",
          props: [
            {
              name: "title",
              type: "string",
              source_node_id: "text-1",
              source_field: "text",
              default_value: "Layo"
            }
          ],
          variant_props: [
            {
              name: "surface",
              type: "string",
              variant_property: "surface",
              default_value: "elevated"
            }
          ],
          docs_url: "https://repo.example/ui/card"
        }
      ]
    }
  });
  expect(mapping.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Card 인스턴스" }).click();
  await expect(page.getByTestId("inspector-component-variant-surface")).toHaveValue("flat");
  await page.getByTestId("inspector-component-variant-surface").selectOption("elevated");
  await expect(page.getByTestId("inspector-component-variant-surface")).toHaveValue("elevated");

  await page.getByTestId("inspector-tab-dev").click();

  const panel = page.getByTestId("dev-panel-code-mapping");
  await expect(panel).toContainText("Code mapping");
  await expect(panel).toContainText("@repo/ui/card");
  await expect(panel).toContainText("import { Card }");
  await expect(panel).toContainText('<Card title={title} surface="elevated" />');
  await expect(panel).toContainText("surface: elevated");
  await expect(panel).toContainText("https://repo.example/ui/card");

  await page.getByTestId("dev-panel-copy-code-mapping").click();
  await expect(page.getByTestId("dev-panel-copy-status")).toContainText("코드 매핑 복사됨");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('import { Card } from "@repo/ui/card";');
  expect(clipboard).toContain('<Card title={title} surface="elevated" />');
});

test("right inspector preserves component instance effect shadow overrides across variants", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const sourceNode = filePayload.file.components[0].source_node;

  const flatSource = structuredClone(sourceNode);
  flatSource.style.effect_shadow = "0 1px 2px rgba(15, 23, 42, 0.08)";
  const raisedSource = structuredClone(sourceNode);
  raisedSource.style.effect_shadow = "0 4px 10px rgba(15, 23, 42, 0.16)";

  const variants = await page.request.put(
    `http://127.0.0.1:4317/files/${documentId}/components/component-card/variants`,
    {
      data: {
        variants: [
          { id: "card-flat", name: "Flat", properties: [{ name: "surface", value: "flat" }], source_node: flatSource },
          {
            id: "card-raised",
            name: "Raised",
            properties: [{ name: "surface", value: "raised" }],
            source_node: raisedSource
          }
        ]
      }
    }
  );
  expect(variants.ok()).toBeTruthy();

  const instance = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/component-instances`, {
    data: {
      parentId: "page-1",
      definitionId: "component-card",
      instanceId: "instance-card",
      x: 520,
      y: 140
    }
  });
  expect(instance.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Card 인스턴스" }).click();

  await page.getByTestId("inspector-effect-shadow").fill("0 18px 36px rgba(15, 23, 42, 0.32)");
  await expect(page.getByTestId("inspector-effect-shadow")).toHaveValue("0 18px 36px rgba(15, 23, 42, 0.32)");

  await page.getByTestId("inspector-component-variant-surface").selectOption("raised");
  await expect(page.getByTestId("inspector-component-variant-surface")).toHaveValue("raised");
  await expect(page.getByTestId("inspector-effect-shadow")).toHaveValue("0 18px 36px rgba(15, 23, 42, 0.32)");

  const persistedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(persistedResponse.ok()).toBeTruthy();
  const persistedPayload = await persistedResponse.json();
  const persistedInstance = persistedPayload.file.pages[0].children.find((node: any) => node.id === "instance-card");
  expect(persistedInstance.style.effect_shadow).toBe("0 18px 36px rgba(15, 23, 42, 0.32)");
  expect(persistedInstance.component_instance.overrides).toEqual(
    expect.arrayContaining([
      {
        node_id: "frame-1",
        field: "effect_shadow",
        value: "0 18px 36px rgba(15, 23, 42, 0.32)"
      }
    ])
  );
});

test("right inspector authors component variants on selected main components", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();

  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();
  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("flat");
  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Elevated");
  await page.getByTestId("inspector-component-definition-variant-property-name-variant-2-0").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("elevated");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");

  const instance = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/component-instances`, {
    data: {
      parentId: "page-1",
      definitionId: "component-card",
      instanceId: "instance-card",
      x: 520,
      y: 140
    }
  });
  expect(instance.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Card 인스턴스" }).click();
  await expect(page.getByTestId("inspector-component-variant-surface")).toBeVisible();
  await expect(page.getByTestId("inspector-component-variant-surface").locator("option")).toHaveText([
    "flat",
    "elevated"
  ]);
  await page.getByTestId("inspector-component-variant-surface").selectOption("elevated");
  await expect(page.getByTestId("inspector-component-variant-surface")).toHaveValue("elevated");
});

test("right inspector edits component variant area layout metadata", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();

  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("flat");
  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Elevated");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("elevated");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");

  const area = page.getByTestId("inspector-component-variant-area");
  await expect(area).toBeVisible();
  await expect(page.getByTestId("inspector-component-variant-area-layout")).toHaveValue("horizontal");
  await expect(page.getByTestId("inspector-component-variant-area-gap")).toHaveValue("32");

  await page.getByTestId("inspector-component-variant-area-layout").selectOption("vertical");
  await page.getByTestId("inspector-component-variant-area-gap").fill("48");
  await page.getByTestId("inspector-component-variant-area-padding-top").fill("12");
  await page.getByTestId("inspector-component-variant-area-padding-right").fill("16");
  await page.getByTestId("inspector-component-variant-area-padding-bottom").fill("12");
  await page.getByTestId("inspector-component-variant-area-padding-left").fill("16");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 영역 저장됨");

  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}/components`);
      const payload = await response.json();
      return payload.components[0].variant_area;
    })
    .toEqual({
      layout: "vertical",
      gap: 48,
      padding: { top: 12, right: 16, bottom: 12, left: 16 }
    });

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-variant-area-layout")).toHaveValue("vertical");
  await expect(page.getByTestId("inspector-component-variant-area-gap")).toHaveValue("48");
  await expect(page.getByTestId("inspector-component-variant-area-padding-top")).toHaveValue("12");
  await expect(page.getByTestId("inspector-component-variant-area-padding-right")).toHaveValue("16");
  await expect(page.getByTestId("inspector-component-variant-area-padding-bottom")).toHaveValue("12");
  await expect(page.getByTestId("inspector-component-variant-area-padding-left")).toHaveValue("16");
});

test("right inspector authors multi-property component variant combinations", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();

  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("flat");
  await page.getByTestId("inspector-component-variant-property-add").click();
  await page.getByTestId("inspector-component-definition-variant-property-name-default-1").fill("size");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-1").fill("regular");

  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Elevated Large");
  await expect(page.getByTestId("inspector-component-definition-variant-property-name-variant-2-0")).toHaveValue(
    "surface"
  );
  await expect(page.getByTestId("inspector-component-definition-variant-property-name-variant-2-1")).toHaveValue(
    "size"
  );
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("elevated");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-1").fill("large");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      const savedComponent = payload.file.components.find(
        (candidate: { id: string }) => candidate.id === "component-card"
      );
      return (
        savedComponent.variants.find(
          (variant: { id: string }) => variant.id === "variant-2"
        )?.properties ?? []
      );
    })
    .toEqual([
      { name: "surface", value: "elevated", type: "select" },
      { name: "size", value: "large", type: "select" }
    ]);

  const instance = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/component-instances`, {
    data: {
      parentId: "page-1",
      definitionId: "component-card",
      instanceId: "instance-card",
      x: 520,
      y: 140
    }
  });
  expect(instance.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Card 인스턴스" }).click();
  await expect(page.getByTestId("inspector-component-variant-surface").locator("option")).toHaveText([
    "flat",
    "elevated"
  ]);
  await expect(page.getByTestId("inspector-component-variant-size").locator("option")).toHaveText([
    "regular",
    "large"
  ]);

  await page.getByTestId("inspector-component-variant-surface").selectOption("elevated");
  await expect(page.getByTestId("inspector-component-variant-size")).toHaveValue("large");
  await expect(page.getByTestId("inspector-component-variant-surface")).toHaveValue("elevated");
});

test("main component variant authoring shows a combination matrix and duplicate warning", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();

  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("flat");
  await page.getByTestId("inspector-component-variant-property-add").click();
  await page.getByTestId("inspector-component-definition-variant-property-name-default-1").fill("size");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-1").fill("regular");

  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Elevated Large");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("elevated");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-1").fill("large");

  const matrix = page.getByTestId("inspector-component-variant-matrix");
  await expect(matrix).toBeVisible();
  await expect(matrix).toContainText("surface");
  await expect(matrix).toContainText("size");
  await expect(page.getByTestId("inspector-component-variant-matrix-cell-default-surface")).toHaveValue("flat");
  await expect(page.getByTestId("inspector-component-variant-matrix-cell-default-size")).toHaveValue("regular");
  await expect(page.getByTestId("inspector-component-variant-matrix-cell-variant-2-surface")).toHaveValue("elevated");
  await expect(page.getByTestId("inspector-component-variant-matrix-cell-variant-2-size")).toHaveValue("large");

  await expect(page.getByTestId("inspector-component-variant-matrix-warning")).toHaveCount(0);

  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-3").fill("Flat Regular Copy");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-3-0").fill("flat");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-3-1").fill("regular");

  await expect(page.getByTestId("inspector-component-variant-matrix-warning")).toContainText("중복 조합");
  await expect(page.getByTestId("inspector-component-variant-matrix-warning")).toContainText("Default");
  await expect(page.getByTestId("inspector-component-variant-matrix-warning")).toContainText("Flat Regular Copy");
});

test("component variant matrix edits cells and deletes properties and variants", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();

  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("flat");
  await page.getByTestId("inspector-component-variant-property-add").click();
  await page.getByTestId("inspector-component-definition-variant-property-name-default-1").fill("size");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-1").fill("regular");
  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Elevated Large");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("elevated");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-1").fill("large");

  const matrixSizeCell = page.getByTestId("inspector-component-variant-matrix-cell-variant-2-size");
  await expect(matrixSizeCell).toHaveValue("large");
  await matrixSizeCell.fill("compact");
  await expect(page.getByTestId("inspector-component-definition-variant-property-value-variant-2-1")).toHaveValue(
    "compact"
  );

  await page.getByTestId("inspector-component-variant-property-remove-size").click();
  await expect(page.getByTestId("inspector-component-variant-matrix")).not.toContainText("size");
  await expect(page.getByTestId("inspector-component-definition-variant-property-name-default-1")).toHaveCount(0);
  await expect(page.getByTestId("inspector-component-variant-property-remove-surface")).toBeDisabled();

  await page.getByTestId("inspector-component-variant-remove-variant-2").click();
  await expect(page.getByTestId("inspector-component-variant-matrix-row-variant-2")).toHaveCount(0);
  await expect(page.getByTestId("inspector-component-variant-remove-default")).toBeDisabled();

  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");
});

test("combines selected components as variants from the context menu", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const commands = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-primary",
          name: "Button / Primary",
          x: 160,
          y: 120,
          width: 140,
          height: 64,
          fill: "#2563eb"
        },
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-secondary",
          name: "Button / Secondary",
          x: 340,
          y: 120,
          width: 180,
          height: 64,
          fill: "#0f766e"
        },
        {
          type: "create_component",
          nodeId: "button-primary",
          componentId: "component-button-primary",
          name: "Button / Primary"
        },
        {
          type: "create_component",
          nodeId: "button-secondary",
          componentId: "component-button-secondary",
          name: "Button / Secondary"
        }
      ]
    }
  });
  expect(commands.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Button / Primary" }).click();
  await page.getByRole("button", { name: "Button / Secondary" }).click({ modifiers: ["Shift"] });

  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  await page.mouse.click(stageBox.x + 172, stageBox.y + 132, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "변형으로 결합" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "변형으로 결합" }).click();

  const matrix = page.getByTestId("inspector-component-variant-matrix");
  await expect(matrix).toBeVisible();
  await expect(page.getByTestId("inspector-component-definition-variant-name-variant-button-primary")).toHaveValue(
    "Primary"
  );
  await expect(page.getByTestId("inspector-component-definition-variant-name-variant-button-secondary")).toHaveValue(
    "Secondary"
  );
  await expect(page.getByTestId("inspector-component-variant-matrix-cell-variant-button-primary-variant")).toHaveValue(
    "Primary"
  );
  await expect(
    page.getByTestId("inspector-component-variant-matrix-cell-variant-button-secondary-variant")
  ).toHaveValue("Secondary");
  await expect(page.getByTestId("component-variant-area-outline")).toBeVisible();

  const horizontalGapHandle = page.getByTestId("component-variant-area-gap-handle-horizontal");
  await expect(horizontalGapHandle).toBeVisible();
  const horizontalGapHandleBox = await horizontalGapHandle.boundingBox();
  if (!horizontalGapHandleBox) {
    throw new Error("component variant horizontal gap handle did not expose a bounding box");
  }
  await page.mouse.move(
    horizontalGapHandleBox.x + horizontalGapHandleBox.width / 2,
    horizontalGapHandleBox.y + horizontalGapHandleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    horizontalGapHandleBox.x + horizontalGapHandleBox.width / 2 + 24,
    horizontalGapHandleBox.y + horizontalGapHandleBox.height / 2
  );
  await page.mouse.up();
  await expect(page.getByTestId("inspector-component-variant-area-gap")).toHaveValue("56");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 영역 저장됨");
  await page.getByRole("button", { name: "Button / Secondary" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("356");
  await page.getByRole("button", { name: "Button / Primary" }).click();

  await page.getByTestId("inspector-component-variant-area-layout").selectOption("vertical");
  await page.getByTestId("inspector-component-variant-area-gap").fill("48");
  await page.getByTestId("inspector-component-variant-area-padding-top").fill("12");
  await page.getByTestId("inspector-component-variant-area-padding-right").fill("16");
  await page.getByTestId("inspector-component-variant-area-padding-bottom").fill("12");
  await page.getByTestId("inspector-component-variant-area-padding-left").fill("16");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 영역 저장됨");

  const areaOutlineBox = await page.getByTestId("component-variant-area-outline").boundingBox();
  expect(areaOutlineBox).not.toBeNull();
  expect(areaOutlineBox!.height).toBeGreaterThan(190);
  expect(areaOutlineBox!.width).toBeLessThan(240);

  const verticalGapHandle = page.getByTestId("component-variant-area-gap-handle-vertical");
  await expect(verticalGapHandle).toBeVisible();
  const verticalGapHandleBox = await verticalGapHandle.boundingBox();
  if (!verticalGapHandleBox) {
    throw new Error("component variant vertical gap handle did not expose a bounding box");
  }
  await page.mouse.move(
    verticalGapHandleBox.x + verticalGapHandleBox.width / 2,
    verticalGapHandleBox.y + verticalGapHandleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    verticalGapHandleBox.x + verticalGapHandleBox.width / 2,
    verticalGapHandleBox.y + verticalGapHandleBox.height / 2 + 16
  );
  await page.mouse.up();
  await expect(page.getByTestId("inspector-component-variant-area-gap")).toHaveValue("64");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 영역 저장됨");

  await page.getByRole("button", { name: "Button / Secondary" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("176");
  await expect(page.getByTestId("inspector-y")).toHaveValue("260");
  await page.getByRole("button", { name: "Button / Primary" }).click();

  await page.mouse.click(stageBox.x + 190, stageBox.y + 148, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "인스턴스 만들기" }).click();
  await expect(page.getByRole("button", { name: "Button 인스턴스" })).toBeVisible();

  await page.getByRole("button", { name: "Button 인스턴스" }).click();
  const selector = page.getByTestId("inspector-component-variant-variant");
  await expect(selector.locator("option")).toHaveText(["Primary", "Secondary"]);
  await selector.selectOption("Secondary");
  await expect(selector).toHaveValue("Secondary");
  await expect(page.getByTestId("inspector-width")).toHaveValue("180");
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#0f766e");
});

test("reorders component variant sources directly from the viewport", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const commands = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-primary",
          name: "Button / Primary",
          x: 160,
          y: 120,
          width: 140,
          height: 64,
          fill: "#2563eb"
        },
        {
          type: "create_rectangle",
          parentId: "page-1",
          id: "button-secondary",
          name: "Button / Secondary",
          x: 340,
          y: 120,
          width: 180,
          height: 64,
          fill: "#0f766e"
        },
        {
          type: "create_component",
          nodeId: "button-primary",
          componentId: "component-button-primary",
          name: "Button / Primary"
        },
        {
          type: "create_component",
          nodeId: "button-secondary",
          componentId: "component-button-secondary",
          name: "Button / Secondary"
        }
      ]
    }
  });
  expect(commands.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Button / Primary" }).click();
  await page.getByRole("button", { name: "Button / Secondary" }).click({ modifiers: ["Shift"] });

  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  await page.mouse.click(stageBox.x + 172, stageBox.y + 132, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "변형으로 결합" }).click();

  const matrixRows = page.locator('[data-testid^="inspector-component-variant-matrix-row-"]');
  await expect(matrixRows.nth(0)).toContainText("Primary");
  await expect(matrixRows.nth(1)).toContainText("Secondary");

  const primaryHandle = page.getByTestId("component-variant-source-reorder-handle-variant-button-primary");
  const secondaryHandle = page.getByTestId("component-variant-source-reorder-handle-variant-button-secondary");
  await expect(primaryHandle).toBeVisible();
  await expect(secondaryHandle).toBeVisible();
  const primaryHandleBox = await primaryHandle.boundingBox();
  const secondaryHandleBox = await secondaryHandle.boundingBox();
  if (!primaryHandleBox || !secondaryHandleBox) {
    throw new Error("component variant source reorder handles did not expose bounding boxes");
  }

  await page.mouse.move(
    secondaryHandleBox.x + secondaryHandleBox.width / 2,
    secondaryHandleBox.y + secondaryHandleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(primaryHandleBox.x - 80, secondaryHandleBox.y + secondaryHandleBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");
  await expect(matrixRows.nth(0)).toContainText("Secondary");
  await expect(matrixRows.nth(1)).toContainText("Primary");

  await page.getByRole("button", { name: "Button / Secondary" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("160");
  await expect(page.getByTestId("inspector-width")).toHaveValue("180");
  await page.getByRole("button", { name: "Button / Primary" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("372");

  await page.getByRole("button", { name: "Button / Secondary" }).click();
  await page.mouse.click(stageBox.x + 180, stageBox.y + 140, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "인스턴스 만들기" }).click();
  await expect(page.getByRole("button", { name: "Button 인스턴스" })).toBeVisible();

  await page.getByRole("button", { name: "Button 인스턴스" }).click();
  const selector = page.getByTestId("inspector-component-variant-variant");
  await expect(selector.locator("option")).toHaveText(["Secondary", "Primary"]);
  await expect(selector).toHaveValue("Secondary");
});

test("component instances render boolean variant properties as toggles", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();

  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("enabled");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("true");
  await page.getByTestId("inspector-component-definition-variant-property-type-default-0").selectOption("boolean");
  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Disabled");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("false");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");

  const instance = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/component-instances`, {
    data: {
      parentId: "page-1",
      definitionId: "component-card",
      instanceId: "instance-card",
      x: 520,
      y: 140
    }
  });
  expect(instance.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Card 인스턴스" }).click();
  await expect(page.getByTestId("inspector-component-variant-enabled")).toHaveCount(0);

  const toggle = page.getByTestId("inspector-component-variant-enabled-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
});

test("component variant property types choose toggle or select controls explicitly", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const component = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/components`, {
    data: { nodeId: "frame-1", componentId: "component-card", name: "Card" }
  });
  expect(component.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-component-definition-variants")).toBeVisible();

  await page.getByTestId("inspector-component-definition-variant-property-name-default-0").fill("enabled");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-0").fill("true");
  const enabledType = page.getByTestId("inspector-component-definition-variant-property-type-default-0");
  await expect(enabledType).toBeVisible();
  await enabledType.selectOption("boolean");

  await page.getByTestId("inspector-component-variant-property-add").click();
  await page.getByTestId("inspector-component-definition-variant-property-name-default-1").fill("surface");
  await page.getByTestId("inspector-component-definition-variant-property-value-default-1").fill("true");
  await expect(page.getByTestId("inspector-component-definition-variant-property-type-default-1")).toHaveValue(
    "select"
  );

  await page.getByTestId("inspector-component-variant-add").click();
  await page.getByTestId("inspector-component-definition-variant-name-variant-2").fill("Disabled");
  await expect(page.getByTestId("inspector-component-definition-variant-property-name-variant-2-0")).toHaveValue(
    "enabled"
  );
  await expect(page.getByTestId("inspector-component-definition-variant-property-type-variant-2-0")).toHaveValue(
    "boolean"
  );
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-0").fill("false");
  await page.getByTestId("inspector-component-definition-variant-property-value-variant-2-1").fill("false");
  await expect(page.getByTestId("project-status")).toContainText("컴포넌트 변형 저장됨");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      const savedComponent = payload.file.components.find(
        (candidate: { id: string }) => candidate.id === "component-card"
      );
      return savedComponent.variants.find(
        (variant: { id: string }) => variant.id === "default"
      ).properties;
    })
    .toEqual([
      { name: "enabled", value: "true", type: "boolean" },
      { name: "surface", value: "true", type: "select" }
    ]);

  const instance = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/component-instances`, {
    data: {
      parentId: "page-1",
      definitionId: "component-card",
      instanceId: "instance-card",
      x: 520,
      y: 140
    }
  });
  expect(instance.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "Card 인스턴스" }).click();

  const toggle = page.getByTestId("inspector-component-variant-enabled-toggle");
  await expect(page.getByTestId("inspector-component-variant-enabled")).toHaveCount(0);
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();

  const surfaceSelect = page.getByTestId("inspector-component-variant-surface");
  await expect(page.getByTestId("inspector-component-variant-surface-toggle")).toHaveCount(0);
  await expect(surfaceSelect).toBeVisible();
  await expect(surfaceSelect.locator("option")).toHaveText(["true", "false"]);
  await expect(surfaceSelect).toHaveValue("true");

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(surfaceSelect).toHaveValue("false");
});

test("inspector dev panel copies generated handoff snippets to the clipboard", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5173"
  });
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();
  await expect(page.getByTestId("dev-panel-css")).toContainText(".node-text-1");
  await expect(page.getByTestId("dev-panel-html")).toContainText('data-node-id="text-1"');
  await expect(page.getByTestId("dev-panel-structure")).toContainText('"id": "text-1"');

  await page.getByTestId("dev-panel-copy-css").click();
  await expect(page.getByTestId("dev-panel-copy-status")).toContainText("CSS 복사됨");
  const cssClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(cssClipboard).toContain(".node-text-1");
  expect(cssClipboard).toContain("font-size");

  await page.getByTestId("dev-panel-copy-html").click();
  await expect(page.getByTestId("dev-panel-copy-status")).toContainText("HTML 복사됨");
  const htmlClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(htmlClipboard).toContain('data-node-id="text-1"');

  await page.getByTestId("dev-panel-copy-structure").click();
  await expect(page.getByTestId("dev-panel-copy-status")).toContainText("구조 복사됨");
  const structureClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(structureClipboard).toContain('"id": "text-1"');

  await page.getByTestId("dev-panel-copy-annotations").click();
  await expect(page.getByTestId("dev-panel-copy-status")).toContainText("핸드오프 복사됨");
  const annotationsClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(annotationsClipboard).toContain("크기/위치");
  expect(annotationsClipboard).toContain("text-1");
});

test("inspector dev panel downloads the selected layer as svg", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-svg").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("text-1.svg");
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("svg download path missing");
  }
  const svg = await readFile(downloadPath, "utf8");

  expect(svg).toContain("<svg");
  expect(svg).toContain('data-node-id="text-1"');
  expect(svg).toContain('aria-label="헤드라인"');
  expect(svg).toContain("Layo");
  expect(svg).toContain("#111827");
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("헤드라인 SVG 다운로드됨");
});

test("inspector dev panel downloads the selected layer as png", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("text-1.png");
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("png download path missing");
  }
  const png = await readFile(downloadPath);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("헤드라인 PNG 다운로드됨");
});

test("inspector dev panel downloads the selected layer as jpeg", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-jpeg").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("text-1.jpg");
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("jpeg download path missing");
  }
  const jpeg = await readFile(downloadPath);
  expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("헤드라인 JPEG 다운로드됨");
});

test("inspector dev panel downloads the selected layer as webp", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-webp").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("text-1.webp");
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("webp download path missing");
  }
  const webp = await readFile(downloadPath);
  expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP");
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("헤드라인 WEBP 다운로드됨");
});

test("inspector dev panel downloads the selected layer as pdf", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("text-1.pdf");
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("pdf download path missing");
  }
  const pdf = await readFile(downloadPath);
  const pdfText = pdf.toString("utf8");
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdfText).toContain("/Type /Page");
  expect(pdfText).toContain("/Title (헤드라인)");
  expect(pdfText.trimEnd().endsWith("%%EOF")).toBe(true);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("헤드라인 PDF 다운로드됨");
});

test("inspector dev panel downloads selected effect shadows in vector artifacts", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const shadows = ["2px 3px 4px 0px rgba(15, 23, 42, 0.2)", "0px 0px 0px 2px rgba(59, 130, 246, 0.18)"];

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-effect-shadow-stack").fill(shadows.join("\n"));
  await page.getByTestId("inspector-tab-dev").click();

  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-svg").click();
  const svgDownload = await svgDownloadPromise;
  const svgPath = await svgDownload.path();
  if (!svgPath) {
    throw new Error("shadow svg download path missing");
  }
  const svg = await readFile(svgPath, "utf8");
  expect(svg).toContain('filter="url(#layo-shadow-text-1)"');
  expect(svg).toContain('flood-color="rgb(15, 23, 42)"');
  expect(svg).toContain('flood-opacity="0.2"');
  expect(svg).toContain('flood-color="rgb(59, 130, 246)"');

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const pdfDownload = await pdfDownloadPromise;
  const pdfPath = await pdfDownload.path();
  if (!pdfPath) {
    throw new Error("shadow pdf download path missing");
  }
  const pdfText = (await readFile(pdfPath)).toString("utf8");
  expect(pdfText).toContain("/ExtGState << /Gs1");
  expect(pdfText).toContain("/ca 0.2");
  expect(pdfText).toContain("/ca 0.18");
});

test("inspector dev panel downloads selected frame artifacts with nested child layers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-svg").click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toBe("frame-1.svg");
  const svgPath = await svgDownload.path();
  if (!svgPath) {
    throw new Error("nested svg download path missing");
  }
  const svg = await readFile(svgPath, "utf8");
  expect(svg).toContain('data-node-id="frame-1"');
  expect(svg).toContain('data-node-id="text-1"');
  expect(svg).toContain('data-node-name="헤드라인"');
  expect(svg).toContain('transform="translate(32 40)"');
  expect(svg).toContain(">Layo</text>");

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe("frame-1.pdf");
  const pdfPath = await pdfDownload.path();
  if (!pdfPath) {
    throw new Error("nested pdf download path missing");
  }
  const pdf = await readFile(pdfPath);
  const pdfText = pdf.toString("utf8");
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdfText).toContain("/Title (랜딩 프레임)");
  expect(pdfText).toContain("/Subject (frame-1)");
  expect(pdfText).toContain("(Layo) Tj");
  expect(pdfText).toContain("32 212 Td");
  expect(pdfText.trimEnd().endsWith("%%EOF")).toBe(true);
});

test("inspector dev panel downloads image artifacts with embedded image asset bytes", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(page, "export-image.png", { width: 18, height: 14 }, "#2563eb");
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 340,
    clientY: stageBox.y + 280
  });
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();

  await page.getByRole("button", { name: "이미지 3" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const svgDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-svg").click();
  const svgDownload = await svgDownloadPromise;
  expect(svgDownload.suggestedFilename()).toBe("image-3.svg");
  const svgPath = await svgDownload.path();
  if (!svgPath) {
    throw new Error("image svg download path missing");
  }
  const svg = await readFile(svgPath, "utf8");
  expect(svg).toContain("<image");
  expect(svg).toContain('data-node-id="image-3"');
  expect(svg).toContain('data-image-asset-id="asset-');
  expect(svg).toContain('href="data:image/png;base64,');

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe("image-3.pdf");
  const pdfPath = await pdfDownload.path();
  if (!pdfPath) {
    throw new Error("image pdf download path missing");
  }
  const pdf = await readFile(pdfPath);
  const pdfText = pdf.toString("utf8");
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdfText).toContain("/Title (이미지 3)");
  expect(pdfText).toContain("/EmbeddedFiles");
  expect(pdfText).toContain("/Type /EmbeddedFile");
  expect(pdfText).toContain("/Subtype /image#2Fpng");
  expect(pdfText).toContain("/Subtype /Image");
  expect(pdfText).toContain("/Filter /FlateDecode");
  expect(pdfText).toContain("/ColorSpace /DeviceRGB");
  expect(pdfText).toContain("/SMask");
  expect(pdfText).toContain("/Im1 Do");
  expect(pdf.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  expect(pdfText.trimEnd().endsWith("%%EOF")).toBe(true);
});

test("inspector dev panel downloads webp image artifacts with rendered pdf preview", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(
    page,
    "export-image.webp",
    { width: 18, height: 14 },
    "#7c3aed",
    "image/webp"
  );
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 340,
    clientY: stageBox.y + 280
  });
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();

  await page.getByRole("button", { name: "이미지 3" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe("image-3.pdf");
  const pdfPath = await pdfDownload.path();
  if (!pdfPath) {
    throw new Error("webp image pdf download path missing");
  }
  const pdf = await readFile(pdfPath);
  const pdfText = pdf.toString("utf8");
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdfText).toContain("/Title (이미지 3)");
  expect(pdfText).toContain("/EmbeddedFiles");
  expect(pdfText).toContain("/Type /EmbeddedFile");
  expect(pdfText).toContain("/Subtype /image#2Fwebp");
  expect(pdfText).toContain("/Subtype /Image");
  expect(pdfText).toContain("/Filter /FlateDecode");
  expect(pdfText).toContain("/ColorSpace /DeviceRGB");
  expect(pdfText).toContain("/Im1 Do");
  expect(pdfText).not.toContain("0.953 0.957 0.965 rg");
  expect(pdfText).not.toContain("0 0 96 75 re");
  expect(pdfText.trimEnd().endsWith("%%EOF")).toBe(true);
});

test("inspector dev panel downloads svg image artifacts with rendered pdf preview", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createSvgImageDataTransfer(page, "export-image.svg", { width: 18, height: 14 }, "#0891b2");
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 340,
    clientY: stageBox.y + 280
  });
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();

  await page.getByRole("button", { name: "이미지 3" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-pdf").click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe("image-3.pdf");
  const pdfPath = await pdfDownload.path();
  if (!pdfPath) {
    throw new Error("svg image pdf download path missing");
  }
  const pdf = await readFile(pdfPath);
  const pdfText = pdf.toString("utf8");
  expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(pdfText).toContain("/Title (이미지 3)");
  expect(pdfText).toContain("/EmbeddedFiles");
  expect(pdfText).toContain("/Type /EmbeddedFile");
  expect(pdfText).toContain("/Subtype /image#2Fsvg#2Bxml");
  expect(pdfText).toContain("<svg");
  expect(pdfText).toContain("/Subtype /Image");
  expect(pdfText).toContain("/Filter /FlateDecode");
  expect(pdfText).toContain("/ColorSpace /DeviceRGB");
  expect(pdfText).toContain("/Im1 Do");
  expect(pdfText).not.toContain("0.953 0.957 0.965 rg");
  expect(pdfText).not.toContain("0 0 96 75 re");
  expect(pdfText.trimEnd().endsWith("%%EOF")).toBe(true);
});

test("inspector dev panel saves and batch-downloads selected layer export presets", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  await page.getByTestId("dev-panel-export-preset-format").selectOption("png");
  await page.getByTestId("dev-panel-export-preset-scale-3x").click();
  await page.getByTestId("dev-panel-export-preset-suffix").fill("@hero");
  await page.getByTestId("dev-panel-export-preset-add").click();
  await expect(page.getByTestId("dev-panel-export-presets")).toContainText("PNG 3x @hero");

  await page.getByTestId("dev-panel-export-preset-format").selectOption("svg");
  await page.getByTestId("dev-panel-export-preset-scale-1x").click();
  await page.getByTestId("dev-panel-export-preset-suffix").fill("");
  await page.getByTestId("dev-panel-export-preset-add").click();
  await expect(page.getByTestId("dev-panel-export-presets")).toContainText("SVG 1x");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      return (await fileResponse.json()).file.pages[0].children[0].children[0].export_presets;
    })
    .toEqual([
      { id: "text-1-export-preset-1", format: "png", scale: 3, suffix: "@hero" },
      { id: "text-1-export-preset-2", format: "svg", scale: 1, suffix: "" }
    ]);

  const downloadedNames: string[] = [];
  page.on("download", (download) => downloadedNames.push(download.suggestedFilename()));
  await page.getByTestId("dev-panel-export-presets-download-all").click();
  await expect.poll(() => downloadedNames.sort()).toEqual(["text-1.svg", "text-1@hero.png"]);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("2개 export preset 다운로드됨");

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();
  await expect(page.getByTestId("dev-panel-export-presets")).toContainText("PNG 3x @hero");
  await expect(page.getByTestId("dev-panel-export-presets")).toContainText("SVG 1x");
});

test("inspector dev panel reviews multi-selection export presets before download", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "rectangle-review",
          name: "검사기",
          x: 320,
          y: 132,
          width: 144,
          height: 88,
          fill: "#dbeafe"
        },
        {
          type: "set_export_presets",
          nodeId: "text-1",
          presets: [{ id: "text-review-png", format: "png", scale: 3, suffix: "@hero" }]
        },
        {
          type: "set_export_presets",
          nodeId: "rectangle-review",
          presets: [{ id: "rectangle-review-svg", format: "svg", scale: 1, suffix: "" }]
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  const headlineLayer = page.getByTestId("layer-panel").getByRole("button", { name: "헤드라인" });
  const inspectorLayer = page.getByTestId("layer-panel").getByRole("button", { name: "검사기" });
  await expect(inspectorLayer).toBeVisible();

  await headlineLayer.click();
  await inspectorLayer.click({ modifiers: ["Shift"] });
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();
  await page.getByTestId("inspector-tab-dev").click();

  const review = page.getByTestId("dev-panel-export-review");
  await expect(review).toContainText("헤드라인 PNG 3x");
  await expect(review).toContainText("text-1@hero.png");
  await expect(review).toContainText("검사기 SVG 1x");
  await expect(review).toContainText("rectangle-review.svg");

  await page.getByTestId("dev-panel-export-review-toggle-rectangle-review:rectangle-review-svg").uncheck();
  const partialZipPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-export-review-download").click();
  const partialZip = await partialZipPromise;
  expect(partialZip.suggestedFilename()).toBe("selected-layers-export-review.zip");
  const partialZipPath = await partialZip.path();
  if (!partialZipPath) {
    throw new Error("multi-selection export review zip path missing");
  }
  const partialZipBytes = await readFile(partialZipPath);
  expect(partialZipBytes.subarray(0, 2).toString("utf8")).toBe("PK");
  expect(readStoredZipEntryNames(partialZipBytes)).toEqual(["text-1@hero.png"]);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("1/2개 export preset ZIP 다운로드됨");
});

test("inspector dev panel reviews page export presets when no layer is selected", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_rectangle",
          parentId: "frame-1",
          id: "rectangle-page-review",
          name: "검사기",
          x: 336,
          y: 136,
          width: 152,
          height: 92,
          fill: "#dbeafe"
        },
        {
          type: "set_export_presets",
          nodeId: "text-1",
          presets: [{ id: "text-page-png", format: "png", scale: 2, suffix: "@page" }]
        },
        {
          type: "set_export_presets",
          nodeId: "rectangle-page-review",
          presets: [{ id: "rectangle-page-svg", format: "svg", scale: 1, suffix: "" }]
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.keyboard.press("Escape");
  await page.getByTestId("inspector-tab-dev").click();

  const review = page.getByTestId("dev-panel-export-review");
  await expect(page.getByTestId("dev-panel-export-review-scope")).toContainText("페이지 export review");
  await expect(review).toContainText("헤드라인 PNG 2x");
  await expect(review).toContainText("text-1@page.png");
  await expect(review).toContainText("검사기 SVG 1x");
  await expect(review).toContainText("rectangle-page-review.svg");

  const fullZipPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-export-review-download").click();
  const fullZip = await fullZipPromise;
  expect(fullZip.suggestedFilename()).toBe("페이지-1-export-review.zip");
  const fullZipPath = await fullZip.path();
  if (!fullZipPath) {
    throw new Error("full export review zip path missing");
  }
  const fullZipBytes = await readFile(fullZipPath);
  expect(fullZipBytes.subarray(0, 2).toString("utf8")).toBe("PK");
  expect(readStoredZipEntryNames(fullZipBytes).sort()).toEqual([
    "rectangle-page-review.svg",
    "text-1@page.png"
  ]);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("2개 export preset ZIP 다운로드됨");

  await page.getByTestId("dev-panel-export-review-toggle-rectangle-page-review:rectangle-page-svg").uncheck();
  const partialZipPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-export-review-download").click();
  const partialZip = await partialZipPromise;
  expect(partialZip.suggestedFilename()).toBe("페이지-1-export-review.zip");
  const partialZipPath = await partialZip.path();
  if (!partialZipPath) {
    throw new Error("partial export review zip path missing");
  }
  const partialZipBytes = await readFile(partialZipPath);
  expect(partialZipBytes.subarray(0, 2).toString("utf8")).toBe("PK");
  expect(readStoredZipEntryNames(partialZipBytes)).toEqual(["text-1@page.png"]);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("1/2개 export preset ZIP 다운로드됨");
});

function findEndOfCentralDirectory(zip: Buffer) {
  const minimumOffset = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("invalid zip archive");
}

function readStoredZipEntryNames(zip: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  let cursor = zip.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    expect(zip.readUInt16LE(cursor + 10)).toBe(0);
    const fileNameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const pathStart = cursor + 46;
    const pathEnd = pathStart + fileNameLength;
    names.push(zip.subarray(pathStart, pathEnd).toString("utf8"));
    cursor = pathEnd + extraLength + commentLength;
  }
  return names;
}

function pngDimensions(png: Buffer) {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}

async function imageDimensions(page: Page, image: Buffer, mimeType: "image/png" | "image/jpeg" | "image/webp") {
  return page.evaluate(
    async ({ base64, mime }) =>
      new Promise<{ width: number; height: number }>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve({ width: element.naturalWidth, height: element.naturalHeight });
        element.onerror = () => reject(new Error(`Could not decode ${mime}`));
        element.src = `data:${mime};base64,${base64}`;
      }),
    { base64: image.toString("base64"), mime: mimeType }
  );
}

test("inspector dev panel downloads png assets at the selected scale", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const defaultDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const defaultDownload = await defaultDownloadPromise;
  expect(defaultDownload.suggestedFilename()).toBe("text-1.png");
  const defaultPath = await defaultDownload.path();
  if (!defaultPath) {
    throw new Error("default png download path missing");
  }
  const defaultSize = pngDimensions(await readFile(defaultPath));

  await page.getByTestId("dev-panel-png-scale-3x").click();
  const scaledDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const scaledDownload = await scaledDownloadPromise;
  expect(scaledDownload.suggestedFilename()).toBe("text-1@3x.png");
  const scaledPath = await scaledDownload.path();
  if (!scaledPath) {
    throw new Error("scaled png download path missing");
  }
  const scaledSize = pngDimensions(await readFile(scaledPath));

  expect(scaledSize.width).toBeGreaterThan(defaultSize.width);
  expect(scaledSize.height).toBeGreaterThan(defaultSize.height);
  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("헤드라인 PNG 3x 다운로드됨");
});

test("inspector dev panel includes effect shadows in selected raster artifacts", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-tab-dev").click();

  const plainPngDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("dev-panel-download-png").click();
  const plainPngDownload = await plainPngDownloadPromise;
  const plainPngPath = await plainPngDownload.path();
  if (!plainPngPath) {
    throw new Error("plain png download path missing");
  }
  const plainSize = await imageDimensions(page, await readFile(plainPngPath), "image/png");

  await page.getByTestId("inspector-tab-design").click();
  await page
    .getByTestId("inspector-effect-shadow-stack")
    .fill("20px 14px 16px 0px rgba(15, 23, 42, 0.35)\n-18px -10px 12px 0px rgba(59, 130, 246, 0.28)");
  await page.getByTestId("inspector-tab-dev").click();

  for (const { testId, mimeType, filename } of [
    { testId: "dev-panel-download-png", mimeType: "image/png" as const, filename: "text-1.png" },
    { testId: "dev-panel-download-jpeg", mimeType: "image/jpeg" as const, filename: "text-1.jpg" },
    { testId: "dev-panel-download-webp", mimeType: "image/webp" as const, filename: "text-1.webp" }
  ]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId(testId).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    const downloadPath = await download.path();
    if (!downloadPath) {
      throw new Error(`${filename} download path missing`);
    }
    const size = await imageDimensions(page, await readFile(downloadPath), mimeType);
    expect(size.width).toBeGreaterThan(plainSize.width + 60);
    expect(size.height).toBeGreaterThan(plainSize.height + 40);
  }

  await expect(page.getByTestId("dev-panel-asset-status")).toContainText("헤드라인 WEBP 다운로드됨");
});

test("file panel exports a project archive and reviews every document before import", async ({ page }) => {
  const { projectId } = await createProjectFromEmptyState(page);
  const secondDocument = await page.request.post(`http://127.0.0.1:4317/projects/${projectId}/documents`, {
    data: { documentId: "project-archive-second", name: "검토 문서" }
  });
  expect(secondDocument.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(projectId);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 프로젝트 아카이브 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${projectId}.layo-project.zip`);
  const archivePath = await download.path();
  if (!archivePath) {
    throw new Error("project archive download path missing");
  }

  await page.getByTestId("project-archive-upload").setInputFiles(archivePath);
  const review = page.getByTestId("project-archive-review");
  await expect(review).toContainText("가져오기 전 프로젝트 검토");
  await expect(review).toContainText("문서 2개");
  await expect(review).toContainText("새 문서");
  await expect(review).toContainText("검토 문서");

  await page.getByTestId("project-archive-import-name").fill("프로젝트 복원본");
  await page.getByRole("button", { name: "검토한 프로젝트 아카이브 가져오기" }).click();
  await expect(page.getByTestId("project-archive-status")).toContainText("프로젝트 복원본 가져옴");
  await expect(page.getByTestId("project-name")).toHaveValue("프로젝트 복원본");
  const restoredProjectId = await page.getByTestId("project-switcher").inputValue();
  const restoredResponse = await page.request.get(`http://127.0.0.1:4317/projects/${restoredProjectId}`);
  expect(restoredResponse.ok()).toBeTruthy();
  expect((await restoredResponse.json()).project.documents).toHaveLength(2);
});

test("filters projects and keeps recently opened projects first", async ({ page }) => {
  await openEmptyEditor(page);
  const alphaProjectId = await createNamedProject(page, "검색 알파");
  const betaProjectId = await createNamedProject(page, "검색 베타");
  await createNamedProject(page, "검색 감마");

  await page.getByTestId("project-search").fill("베타");
  await expect(page.getByTestId("project-filter-summary")).toContainText("1개 프로젝트");
  await expect(page.getByTestId("project-switcher").locator("option")).toHaveText(["검색 베타"]);
  await page.getByTestId("project-switcher").selectOption(betaProjectId);
  await expect(page.getByTestId("project-status")).toContainText("검색 베타 불러옴");

  await page.getByTestId("project-search").fill("");
  await page.getByTestId("project-switcher").selectOption(alphaProjectId);
  await expect(page.getByTestId("project-status")).toContainText("검색 알파 불러옴");
  await page.reload();
  await openFilePanel(page);
  await expect(page.getByTestId("project-switcher")).toHaveValue(alphaProjectId);
  await expect(page.getByTestId("project-switcher").locator("option").first()).toHaveText("검색 알파");
});

test("duplicates and deletes a saved project from the project panel", async ({ page }) => {
  await openEmptyEditor(page);
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const sourceProjectId = await page.getByTestId("project-switcher").inputValue();

  await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
  await expect(page.getByTestId("project-status")).toContainText("프로젝트 복제됨");
  const duplicatedProjectId = await page.getByTestId("project-switcher").inputValue();
  expect(duplicatedProjectId).not.toBe(sourceProjectId);
  await expect(page.getByTestId("project-name")).toHaveValue(/사본/);

  const projectsAfterDuplicate = await page.request.get("http://127.0.0.1:4317/projects");
  expect(projectsAfterDuplicate.ok()).toBeTruthy();
  const duplicatePayload = await projectsAfterDuplicate.json();
  expect(duplicatePayload.projects.map((project: { projectId: string }) => project.projectId)).toEqual(
    expect.arrayContaining([sourceProjectId, duplicatedProjectId])
  );

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "현재 프로젝트 삭제" }).click();
  await expect(page.getByTestId("project-status")).toContainText("프로젝트 삭제됨");
  await expect(page.getByTestId("project-switcher")).not.toHaveValue(duplicatedProjectId);

  const deletedProject = await page.request.get(
    `http://127.0.0.1:4317/projects/${duplicatedProjectId}`
  );
  expect(deletedProject.status()).toBe(404);
});

test("inserts image files from drop and clipboard paste", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const dropTransfer = await createImageDataTransfer(page, "drop-image.png");
  await stageFrame.dispatchEvent("dragover", {
    dataTransfer: dropTransfer,
    clientX: stageBox.x + 260,
    clientY: stageBox.y + 220
  });
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: dropTransfer,
    clientX: stageBox.x + 260,
    clientY: stageBox.y + 220
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await expect(page.locator(".node-summary span")).toHaveText("이미지");
  await expect(page.getByTestId("selection-size-badge")).toBeVisible();

  const pasteTransfer = await createImageDataTransfer(page, "paste-image.png");
  await page.evaluate((dataTransfer) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: dataTransfer });
    window.dispatchEvent(event);
  }, pasteTransfer);

  await expect(page.getByRole("button", { name: "이미지 4" })).toBeVisible();

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const nodeKinds = flattenNodeKinds(filePayload.file.pages[0].children);
  expect(nodeKinds.filter((kind) => kind === "image")).toHaveLength(2);
});

test("canvas editor MVP supports Korean-first select, inspect, edit, undo, create, and zoom", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다시 실행" })).toHaveCount(0);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("32");

  const canvas = page.getByTestId("canvas-area");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("canvas area was not visible");
  }
  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 162, stageBox.y + 130);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 202, stageBox.y + 160);
  await page.mouse.up();
  await expect(page.getByTestId("inspector-x")).toHaveValue("72");
  await expect(page.getByTestId("inspector-y")).toHaveValue("70");

  const bottomRightHandleBox = await page.getByTestId("resize-handle-bottom-right").boundingBox();
  if (!bottomRightHandleBox) {
    throw new Error("bottom-right resize handle was not visible");
  }
  const bottomRightHandleCenter = {
    x: bottomRightHandleBox.x + bottomRightHandleBox.width / 2,
    y: bottomRightHandleBox.y + bottomRightHandleBox.height / 2
  };

  await page.mouse.move(bottomRightHandleCenter.x, bottomRightHandleCenter.y);
  await page.mouse.down();
  await page.mouse.move(bottomRightHandleCenter.x + 70, bottomRightHandleCenter.y + 60);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-width").inputValue()))
    .toBeGreaterThan(260);
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-height").inputValue()))
    .toBeGreaterThan(48);

  await page.getByTestId("inspector-x").fill("96");
  await page.getByTestId("inspector-y").fill("112");
  await page.getByTestId("inspector-width").fill("300");
  await page.getByTestId("inspector-height").fill("60");
  await page.getByTestId("inspector-text").fill("검증된 MVP 헤드라인");

  await expect(page.getByTestId("inspector-x")).toHaveValue("96");
  await expect(page.getByTestId("inspector-y")).toHaveValue("112");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("60");
  await expect(page.getByTestId("inspector-text")).toHaveValue("검증된 MVP 헤드라인");

  await page.getByRole("button", { name: "확대" }).focus();
  await page.keyboard.press("Control+Z");
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.keyboard.press("Control+Shift+Z");
  await expect(page.getByTestId("inspector-text")).toHaveValue("검증된 MVP 헤드라인");

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "컴포넌트 만들기" }).click();
  await expect(page.getByRole("button", { name: /랜딩 프레임 .* 컴포넌트/ })).toBeVisible();

  await page.getByRole("button", { name: "인스턴스 만들기" }).click();
  await expect(page.getByRole("button", { name: /랜딩 프레임 컴포넌트 인스턴스 .* 인스턴스/ })).toBeVisible();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");

  await page.getByRole("button", { name: "인스턴스 분리" }).click();
  await expect(page.locator(".node-summary span")).toHaveText("프레임");

  await page.getByRole("button", { name: "확대" }).click();
  await expect(floatingToolbarZoom(page, "125%")).toBeVisible();

  const agentId = `agent-note-${Date.now()}`;
  const agentName = `에이전트 메모 ${Date.now()}`;
  const agentValue = "에이전트가 만든 검증 텍스트";
  const agentResponse = await page.request.post(
    `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
    {
      data: {
        dryRun: false,
        commands: [
          {
            type: "create_text",
            parentId: "page-1",
            id: agentId,
            name: agentName,
            value: agentValue,
            x: 96,
            y: 360,
            width: 280,
            height: 48,
            fill: "#111827",
            fontSize: 20,
            fontFamily: "Inter"
          }
        ]
      }
    }
  );
  expect(agentResponse.ok()).toBeTruthy();
  const agentResult = await agentResponse.json();
  expect(agentResult.result.audit.changedNodeIds).toEqual([agentId]);

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByRole("button", { name: agentName })).toBeVisible();
  await page.getByRole("button", { name: agentName }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue(agentValue);

  await page.screenshot({ path: "/tmp/layo-mvp-verified.png", fullPage: true });
});

test("web editor fills the available work area with a neutral infinite canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEmptyEditor(page);
  await expect(page.getByTestId("stage-frame")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-area"]') as HTMLElement | null;
    const stage = document.querySelector('[data-testid="stage-frame"]') as HTMLElement | null;

    if (!canvas || !stage) {
      throw new Error("layout nodes missing");
    }

    window.scrollTo(1000, 0);
    const pageScrollXAfterAttempt = window.scrollX;
    window.scrollTo(0, 0);

    return {
      pageScrollXAfterAttempt,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      canvasClientWidth: canvas.clientWidth,
      canvasClientHeight: canvas.clientHeight,
      canvasScrollWidth: canvas.scrollWidth,
      canvasScrollHeight: canvas.scrollHeight,
      canvasBackground: getComputedStyle(canvas).backgroundColor,
      stageBackground: getComputedStyle(stage).backgroundColor,
      stageWidth: Math.round(stage.getBoundingClientRect().width),
      stageHeight: Math.round(stage.getBoundingClientRect().height)
    };
  });

  expect(metrics.pageScrollXAfterAttempt).toBe(0);
  expect(metrics.documentScrollWidth).toBe(metrics.viewportWidth);
  expect(metrics.canvasScrollWidth).toBe(metrics.canvasClientWidth);
  expect(metrics.canvasScrollHeight).toBe(metrics.canvasClientHeight);
  expect(metrics.canvasBackground).toBe("rgb(238, 242, 246)");
  expect(metrics.stageBackground).toBe("rgba(0, 0, 0, 0)");
  expect(metrics.stageWidth).toBe(metrics.canvasClientWidth);
  expect(metrics.stageHeight).toBe(metrics.canvasClientHeight);
});

test("left sidebar can collapse from the top toolbar", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await expect(page.getByRole("heading", { name: "파일" })).toBeVisible();
  await page.getByRole("button", { name: "왼쪽 사이드바 접기" }).click();
  await expect(page.getByRole("heading", { name: "파일" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "헤드라인" })).toHaveCount(0);
  await expect(page.getByTestId("stage-frame")).toBeVisible();

  await page.getByRole("button", { name: "왼쪽 사이드바 펼치기" }).click();
  await expect(page.getByRole("heading", { name: "파일" })).toBeVisible();
  await expect(page.getByRole("button", { name: "헤드라인" })).toBeVisible();
});

test("component toolbar actions use component-style icons instead of letter labels", async ({ page }) => {
  await openEmptyEditor(page);

  await expect(page.getByRole("button", { name: "컴포넌트 만들기" })).not.toHaveText("C");
  await expect(page.getByRole("button", { name: "인스턴스 만들기" })).not.toHaveText("I");
  await expect(page.getByRole("button", { name: "인스턴스 분리" })).not.toHaveText("D");
});

test("Figma-like editor shell separates rail, rulers, floating toolbar, and inspector sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEmptyEditor(page);

  await expect(page.getByTestId("editor-rail")).toBeVisible();
  await expect(page.getByTestId("editor-rail").getByRole("button", { name: "파일" })).toBeVisible();
  await expect(page.getByTestId("editor-rail").getByRole("button", { name: "에셋" })).toBeVisible();
  await expect(page.getByTestId("editor-rail").getByRole("button", { name: "레이어" })).toBeVisible();

  await expect(page.getByTestId("canvas-ruler-horizontal")).toBeVisible();
  await expect(page.getByTestId("canvas-ruler-vertical")).toBeVisible();

  const floatingToolbar = page.getByTestId("floating-toolbar");
  await expect(floatingToolbar).toBeVisible();
  const toolbarBox = await floatingToolbar.boundingBox();
  const workspaceBox = await page.locator(".editor-workspace").boundingBox();
  if (!toolbarBox || !workspaceBox) {
    throw new Error("editor shell geometry was not visible");
  }
  const toolbarCenterX = toolbarBox.x + toolbarBox.width / 2;
  const workspaceCenterX = workspaceBox.x + workspaceBox.width / 2;
  expect(toolbarBox?.y).toBeGreaterThan(760);
  expect(Math.abs(toolbarCenterX - workspaceCenterX)).toBeLessThan(4);

  await expect(page.getByTestId("inspector-tabs")).toBeVisible();
  await expect(page.getByTestId("inspector-action-strip")).toBeVisible();
  await expect(page.getByTestId("inspector-avatar")).toBeVisible();
  await expect(page.getByTestId("inspector-zoom-readout")).toHaveText("100%");
  await expect(page.getByRole("button", { name: "미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "공유하기" })).toBeVisible();
  await expect(page.getByTestId("inspector-section-frame")).toBeVisible();
  await expect(page.getByTestId("inspector-section-presets")).toBeVisible();
  await expect(page.getByTestId("inspector-section-presets")).toContainText("프레젠테이션");
  await expect(page.getByTestId("inspector-section-presets")).toContainText("소셜 미디어");
  await expect(page.getByTestId("inspector-section-presets")).toContainText("아카이브");

  const canvasBackground = await page.getByTestId("canvas-area").evaluate((node) =>
    getComputedStyle(node).backgroundColor
  );
  expect(canvasBackground).not.toBe("rgb(255, 255, 255)");
});

test("left rail switches active panels and top file bar preserves file context", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await expect(page.getByTestId("top-file-bar")).toBeVisible();
  await expect(page.getByTestId("top-file-project")).toContainText("새 프로젝트");
  await expect(page.getByTestId("top-file-document")).toContainText("새 문서");
  await expect(page.getByTestId("top-file-share")).toContainText("비공개");

  await page.getByTestId("editor-rail").getByRole("button", { name: "에셋" }).click();
  await expect(page.getByTestId("asset-panel")).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toContainText("팀 라이브러리");
  await expect(page.getByTestId("layer-panel")).toHaveCount(0);
  await expect(page.getByTestId("team-panel")).toHaveCount(0);

  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await expect(page.getByTestId("layer-panel")).toBeVisible();
  await expect(page.getByTestId("layer-panel").getByRole("button", { name: "헤드라인" })).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toHaveCount(0);
  await expect(page.getByTestId("team-panel")).toHaveCount(0);

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await expect(page.getByTestId("team-panel")).toBeVisible();
  await expect(page.getByTestId("team-name")).toBeVisible();
  await expect(page.getByTestId("asset-panel")).toHaveCount(0);
  await expect(page.getByTestId("layer-panel")).toHaveCount(0);

  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();
  await expect(page.getByTestId("project-switcher")).toBeVisible();
  await expect(page.getByTestId("project-name")).toHaveValue(/새 프로젝트/);
});

test("right-click objects and images expose common context menu commands", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  await page.mouse.click(stageBox.x + 170, stageBox.y + 135, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "잘라내기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "복사", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "붙여넣기", exact: true })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "여기에 붙여넣기" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "복제" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "삭제" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "맨 앞으로 가져오기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "앞으로 가져오기", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "뒤로 보내기", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "맨 뒤로 보내기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "컴포넌트 만들기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "인스턴스 만들기" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "인스턴스 분리" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "왼쪽 맞춤" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "아래쪽 맞춤" })).toBeEnabled();

  await menu.getByRole("menuitem", { name: "복제" }).click();
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();

  const imageTransfer = await createImageDataTransfer(page, "context-image.png");
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 320,
    clientY: stageBox.y + 260
  });
  await expect(page.getByRole("button", { name: "이미지 4" })).toBeVisible();

  await page.mouse.click(stageBox.x + 320, stageBox.y + 260, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "잘라내기" }).click();
  await expect(page.getByRole("button", { name: "이미지 4" })).toHaveCount(0);

  await page.mouse.click(stageBox.x + 380, stageBox.y + 320, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "여기에 붙여넣기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "여기에 붙여넣기" }).click();
  await expect(page.getByRole("button", { name: /이미지 4 복사본/ })).toBeVisible();
});

test("right-click menu presents Figma-like shortcut hints and grouped sections", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  await page.mouse.click(stageBox.x + 170, stageBox.y + 135, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();

  await expect(menu.getByTestId("object-context-menu-section")).toHaveCount(7);
  await expect(menu.getByTestId("object-context-menu-section").first()).toHaveAttribute(
    "aria-label",
    "클립보드"
  );
  await expect(menu.getByRole("menuitem", { name: "복사", exact: true })).toContainText("⌘C");
  await expect(menu.getByRole("menuitem", { name: "붙여넣기", exact: true })).toContainText("⌘V");
  await expect(menu.getByRole("menuitem", { name: "복제" })).toContainText("⌘D");
  await expect(menu.getByRole("menuitem", { name: "삭제" })).toContainText("Delete");
  await expect(menu.getByRole("menuitem", { name: "그룹으로 묶기" })).toContainText("⌘G");
  await expect(menu.getByRole("menuitem", { name: "그룹 해제" })).toContainText("⇧⌘G");
  await expect(menu.getByRole("menuitem", { name: "왼쪽 맞춤" })).toContainText("⌥A");
  await expect(menu.getByRole("menuitem", { name: "가운데 맞춤", exact: true })).toContainText("⌥H");
  await expect(menu.getByRole("menuitem", { name: "오른쪽 맞춤" })).toContainText("⌥D");
  await expect(menu.getByRole("menuitem", { name: "위쪽 맞춤" })).toContainText("⌥W");
  await expect(menu.getByRole("menuitem", { name: "세로 가운데 맞춤" })).toContainText("⌥V");
  await expect(menu.getByRole("menuitem", { name: "아래쪽 맞춤" })).toContainText("⌥S");
  await expect(menu.getByTestId("context-menu-shortcut")).toHaveCount(19);
});

test("right-click image menu restores the uploaded original size", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(page, "large-context-image.png", {
    width: 720,
    height: 480
  });
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 420,
    clientY: stageBox.y + 320
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "원본 크기로 맞춤" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "원본 크기로 맞춤" }).click();

  await expect(page.getByTestId("inspector-width")).toHaveValue("720");
  await expect(page.getByTestId("inspector-height")).toHaveValue("480");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("720 x 480");
});

test("right-click image menu replaces the image asset while keeping geometry", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(
    page,
    "replace-original.png",
    { width: 720, height: 480 },
    "#2563eb"
  );
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 420,
    clientY: stageBox.y + 320
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "이미지 바꾸기" })).toBeEnabled();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await menu.getByRole("menuitem", { name: "이미지 바꾸기" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(
    await createImageUploadFile(page, "replace-next.png", { width: 300, height: 900 }, "#16a34a")
  );

  await expect(page.getByTestId("project-status")).toContainText("이미지 3 이미지 바뀜");
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await page.getByRole("button", { name: "이미지 3" }).click();
  await expect(page.getByTestId("inspector-width")).toHaveValue("480");
  await expect(page.getByTestId("inspector-height")).toHaveValue("320");
  const reloadedStageBox = await stageFrame.boundingBox();
  if (!reloadedStageBox) {
    throw new Error("stage frame was not visible after reload");
  }

  await page.mouse.click(reloadedStageBox.x + 420, reloadedStageBox.y + 320, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: "원본 크기로 맞춤" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "원본 크기로 맞춤" }).click();

  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("900");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("300 x 900");
});

test("right-click image menu switches between fill and fit sizing modes", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(
    page,
    "wide-fill-fit.png",
    { width: 900, height: 300 },
    "#2563eb"
  );
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 420,
    clientY: stageBox.y + 320
  });

  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("300");
  await page.getByTestId("inspector-height").fill("300");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("300");

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "이미지 맞춤" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "이미지 맞춤" }).click();
  await expect(page.getByTestId("project-status")).toContainText("이미지 3 이미지 맞춤");

  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      return payload.file.pages[0].children.find(
        (node: { id: string }) => node.id === "image-3"
      ).content.fit_mode;
    })
    .toBe("fit");

  await page.reload();
  await openFilePanel(page);
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();
  await page.getByRole("button", { name: "이미지 3" }).click();

  const reloadedStageBox = await stageFrame.boundingBox();
  if (!reloadedStageBox) {
    throw new Error("stage frame was not visible after reload");
  }
  await page.mouse.click(reloadedStageBox.x + 420, reloadedStageBox.y + 320, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: "이미지 채우기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "이미지 채우기" }).click();

  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      return payload.file.pages[0].children.find(
        (node: { id: string }) => node.id === "image-3"
      ).content.fit_mode;
    })
    .toBe("fill");
});

test("right-click menu locks and hides objects while layer state remains recoverable", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  await expect(rectangleLayer).toBeVisible();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");

  await page.mouse.click(stageBox.x + 240, stageBox.y + 190, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "잠그기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "숨기기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "잠그기" }).click();

  const lockedRectangleLayer = page.getByRole("button", { name: /사각형 3.*잠김/ });
  await expect(lockedRectangleLayer).toBeVisible();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");
  await page.mouse.move(stageBox.x + 240, stageBox.y + 190);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 300, stageBox.y + 240);
  await page.mouse.up();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "잠금 해제" }).click();
  await expect(page.getByRole("button", { name: /^사각형 3$/ })).toBeVisible();

  await page.mouse.click(stageBox.x + 240, stageBox.y + 190, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "숨기기" }).click();
  await expect(page.getByRole("button", { name: /사각형 3.*숨김/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.mouse.click(stageBox.x + 240, stageBox.y + 190);
  await expect(page.getByRole("button", { name: /사각형 3.*숨김/ })).not.toHaveClass(/is-selected/);

  await page.getByRole("button", { name: /사각형 3.*숨김/ }).click();
  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "표시" }).click();
  await expect(page.getByRole("button", { name: /^사각형 3$/ })).toBeVisible();
});

test("right-click menu groups, renames, and ungroups selected objects", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();

  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await firstRectangle.click();
  await page.keyboard.down("Shift");
  await secondRectangle.click();
  await page.keyboard.up("Shift");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "그룹으로 묶기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "그룹으로 묶기" }).click();

  await expect(page.getByRole("button", { name: /그룹 5/ })).toBeVisible();

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("레이어 이름");
    await dialog.accept("헤더 그룹");
  });
  await menu.getByRole("menuitem", { name: "이름 변경" }).click();
  await expect(page.getByRole("button", { name: /^헤더 그룹/ })).toBeVisible();

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "그룹 해제" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "그룹 해제" }).click();

  await expect(page.getByRole("button", { name: /^헤더 그룹/ })).toHaveCount(0);
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();
});

test("right-click menu frames the selected objects", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();

  await page.getByRole("button", { name: "사각형 3" }).click();
  await page.keyboard.down("Shift");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await page.keyboard.up("Shift");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "선택 영역 프레임 만들기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "선택 영역 프레임 만들기" }).click();

  await expect(page.getByRole("button", { name: /프레임 5/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();

  const selectedFrame = page.getByRole("button", { name: /프레임 5/ });
  await expect(selectedFrame).toHaveClass(/is-selected/);
});

test("right-click menu supports expanded selection, transform, zoom, and export actions", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-x").fill("420");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "전체 선택" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "같은 종류 선택" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "선택 영역 확대" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "가로 뒤집기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "세로 뒤집기" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "코드로 내보내기" })).toBeEnabled();

  await menu.getByRole("menuitem", { name: "같은 종류 선택" }).click();
  await expect(page.locator(".node-summary strong")).toHaveText("2개 레이어 선택됨");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "가로 뒤집기" }).click();
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("180");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("420");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "전체 선택" }).click();
  await expect(page.locator(".node-summary strong")).toHaveText("3개 레이어 선택됨");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await menu.getByRole("menuitem", { name: "선택 영역 확대" }).click();
  await expect(page.getByTestId("floating-toolbar").locator(".zoom-readout")).not.toHaveText("100%");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const downloadPromise = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "코드로 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^layo-code-export-.*\.json$/);
  await expect(page.getByTestId("project-status")).toContainText("코드 내보내기 완료");
});

test("right-click menu copies object styles and exports the selected object as PNG", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const blankMenuPoint = {
    x: stageBox.x + Math.max(24, stageBox.width - 36),
    y: stageBox.y + Math.max(24, stageBox.height - 36)
  };

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#f97316");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#38bdf8");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "스타일 복사" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "스타일 복사" }).click();
  await expect(page.getByTestId("project-status")).toContainText("사각형 3 스타일 복사됨");

  await page.getByRole("button", { name: "사각형 4" }).click();
  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "스타일 붙여넣기" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "스타일 붙여넣기" }).click();
  await expect(page.getByTestId("project-status")).toContainText("사각형 4 스타일 적용됨");

  await expect(page.getByTestId("inspector-fill")).toHaveValue("#f97316");

  await page.mouse.click(blankMenuPoint.x, blankMenuPoint.y, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "PNG로 내보내기" })).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "PNG로 내보내기" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("rectangle-4.png");
  await expect(page.getByTestId("project-status")).toContainText("사각형 4 PNG 내보내기 완료");
});

test("Figma-like canvas input routing nudges layers, pans canvas, and zooms with modifiers", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 360, stageBox.y + 260);
  await page.mouse.wheel(0, -300);
  await expect(floatingToolbarZoom(page, "100%")).toBeVisible();

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect(floatingToolbarZoom(page, "125%")).toBeVisible();

  await page.keyboard.press("Control+=");
  await expect(floatingToolbarZoom(page, "150%")).toBeVisible();
  await page.keyboard.press("Control+-");
  await expect(floatingToolbarZoom(page, "125%")).toBeVisible();
  await page.keyboard.press("Control+0");
  await expect(floatingToolbarZoom(page, "100%")).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("inspector-x")).toHaveValue("33");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByTestId("inspector-y")).toHaveValue("50");

  await page.keyboard.down("Space");
  await page.mouse.move(stageBox.x + 160, stageBox.y + 130);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 220, stageBox.y + 160);
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(page.getByTestId("inspector-x")).toHaveValue("33");
  await expect(page.getByTestId("inspector-y")).toHaveValue("50");

  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");
  await page.getByTestId("inspector-text").fill("키보드 단축키 검증");
  await expect(page.getByTestId("inspector-text")).toHaveValue("키보드 단축키 검증");

  await page.mouse.click(stageBox.x + 40, stageBox.y + 40);
  await page.keyboard.press("Control+Z");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.mouse.click(stageBox.x + 40, stageBox.y + 40);
  await page.keyboard.press("Control+Shift+Z");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("키보드 단축키 검증");

  await page.keyboard.press("Escape");
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();
});

test("text layers enter inline edit mode on double click", async ({ page }) => {
  await createProjectFromEmptyState(page);

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.dblclick(stageBox.x + 170, stageBox.y + 135);

  const inlineEditor = page.getByTestId("inline-text-editor");
  await expect(inlineEditor).toBeVisible();
  await expect(inlineEditor).toBeFocused();
  await expect(inlineEditor).toHaveValue("Layo");

  await inlineEditor.fill("더블클릭으로 바로 수정");
  await expect(page.getByTestId("inspector-text")).toHaveValue("더블클릭으로 바로 수정");

  await page.keyboard.press("Escape");
  await expect(inlineEditor).toHaveCount(0);
  await expect(page.getByTestId("inspector-text")).toHaveValue("더블클릭으로 바로 수정");
});

test("empty text inspector field renders as a single underline with placeholder", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  const textField = page.getByTestId("inspector-text");

  await textField.fill("");

  await expect(textField).toHaveValue("");
  await expect(textField).toHaveAttribute("placeholder", "텍스트 입력");
  await expect(textField).toHaveCSS("border-top-width", "0px");
  await expect(textField).toHaveCSS("border-bottom-width", "1px");
});

test("text inspector persists vertical writing mode into dev handoff", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  const writingMode = page.getByTestId("inspector-text-writing-mode");
  await expect(writingMode).toHaveValue("horizontal_tb");

  await writingMode.selectOption("vertical_rl");
  await expect(writingMode).toHaveValue("vertical_rl");

  await page.getByTestId("inspector-tab-dev").click();
  await expect(page.getByTestId("dev-panel-css")).toContainText("writing-mode: vertical-rl;");
  await expect(page.getByTestId("dev-panel-structure")).toContainText('"writingMode": "vertical_rl"');

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const textNode = filePayload.file.pages[0].children[0].children.find((node: { id: string }) => node.id === "text-1");
  expect(textNode.content.writing_mode).toBe("vertical_rl");
});

test("text inspector renders vertical writing mode visibly on the canvas", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("세로쓰기테스트");
  await page.getByTestId("inspector-fill").fill("#d946ef");
  await page.getByTestId("inspector-width").fill("220");
  await page.getByTestId("inspector-height").fill("180");

  const targetColor = { r: 217, g: 70, b: 239 };
  await expect
    .poll(async () => {
      const bounds = await findCanvasColorBounds(page, targetColor);
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;
      return Math.round((width / Math.max(1, height)) * 10);
    })
    .toBeGreaterThan(20);

  await page.getByTestId("inspector-text-writing-mode").selectOption("vertical_rl");
  await expect(page.getByTestId("inspector-text-writing-mode")).toHaveValue("vertical_rl");

  await expect
    .poll(async () => {
      const bounds = await findCanvasColorBounds(page, targetColor);
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;
      return Math.round((height / Math.max(1, width)) * 10);
    })
    .toBeGreaterThan(20);
});

test("mixed vertical text orientation renders Unicode script groups on the canvas", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("AéΩЖ漢한、１€#");
  await page.getByTestId("inspector-fill").fill("#0ea5e9");
  await page.getByTestId("inspector-width").fill("260");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-text-writing-mode").selectOption("vertical_rl");

  const textOrientation = page.getByTestId("inspector-text-orientation");
  await expect(textOrientation).toHaveValue("mixed");

  await expect
    .poll(async () => {
      const bounds = await findCanvasColorBounds(page, { r: 14, g: 165, b: 233 });
      return (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
    })
    .toBeGreaterThan(100);

  await textOrientation.selectOption("upright");
  await expect(textOrientation).toHaveValue("upright");
  await textOrientation.selectOption("mixed");
  await expect(textOrientation).toHaveValue("mixed");

  await page.getByTestId("inspector-tab-dev").click();
  await expect(page.getByTestId("dev-panel-css")).toContainText("writing-mode: vertical-rl;");
});
test("text inspector persists vertical text orientation into dev handoff", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("AB12");
  await page.getByTestId("inspector-fill").fill("#22c55e");

  const textOrientation = page.getByTestId("inspector-text-orientation");
  await expect(textOrientation).toHaveValue("mixed");

  await page.getByTestId("inspector-text-writing-mode").selectOption("vertical_rl");
  await textOrientation.selectOption("sideways");
  await expect(textOrientation).toHaveValue("sideways");

  await expect
    .poll(async () => {
      const bounds = await findCanvasColorBounds(page, { r: 34, g: 197, b: 94 });
      return bounds.right - bounds.left + bounds.bottom - bounds.top;
    })
    .toBeGreaterThan(20);

  await page.getByTestId("inspector-tab-dev").click();
  await expect(page.getByTestId("dev-panel-css")).toContainText("text-orientation: sideways;");
  await expect(page.getByTestId("dev-panel-structure")).toContainText('"textOrientation": "sideways"');

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const filePayload = await fileResponse.json();
  const textNode = filePayload.file.pages[0].children[0].children.find((node: { id: string }) => node.id === "text-1");
  expect(textNode.content.writing_mode).toBe("vertical_rl");
  expect(textNode.content.text_orientation).toBe("sideways");
});

test("file version history saves and restores a document snapshot", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByTestId("file-version-message").fill("검토 전");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("검토 전 저장됨");
  await expect(page.getByTestId("file-version-list")).toContainText("검토 전");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("복원 전 변경");
  await expect(page.getByTestId("inspector-text")).toHaveValue("복원 전 변경");

  await expect
    .poll(async () => {
      const changedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      if (!changedResponse.ok()) {
        return "request failed";
      }
      return (await changedResponse.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("복원 전 변경");

  await page.getByRole("button", { name: "검토 전 복원" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("검토 전 복원됨");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  const restoredResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(restoredResponse.ok()).toBeTruthy();
  expect((await restoredResponse.json()).file.pages[0].children[0].children[0].content.value).toBe("Layo");

  const versionsResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}/versions`);
  expect(versionsResponse.ok()).toBeTruthy();
  const versionsPayload = await versionsResponse.json();
  expect(versionsPayload.versions.map((version: { source: string }) => version.source)).toContain("restore");
});

test("file version save includes a rectangle created immediately before the checkpoint", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByTestId("file-version-message").fill("도형 생성 포함");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("도형 생성 포함 저장됨");

  const versionsResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}/versions`);
  const versions = (await versionsResponse.json()).versions as Array<{ versionId: string; message: string }>;
  const savedVersion = versions.find((version) => version.message === "도형 생성 포함");
  expect(savedVersion).toBeTruthy();
  const versionResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/versions/${savedVersion!.versionId}`
  );
  const savedNodes = (await versionResponse.json()).version.document.pages
    .flatMap((pageItem: { children: Array<{ id: string; children: unknown[] }> }) => pageItem.children);
  expect(JSON.stringify(savedNodes)).toContain('"id":"rectangle-3"');
});

test("file version save waits for an earlier delayed document write", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  let releaseTextWrite: (() => void) | undefined;
  const textWriteRelease = new Promise<void>((resolve) => {
    releaseTextWrite = resolve;
  });
  let markTextWriteStarted: (() => void) | undefined;
  const textWriteStarted = new Promise<void>((resolve) => {
    markTextWriteStarted = resolve;
  });
  let versionSaveStarted = false;

  await page.route(`**/files/${documentId}/agent/commands`, async (route) => {
    const body = route.request().postDataJSON() as {
      commands?: Array<{ type?: string }>;
    };
    if (body.commands?.some((command) => command.type === "update_text")) {
      markTextWriteStarted?.();
      await textWriteRelease;
    }
    await route.continue();
  });
  await page.route(`**/files/${documentId}/versions`, async (route) => {
    if (route.request().method() === "POST") {
      versionSaveStarted = true;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("저장 큐 기준");
  await textWriteStarted;
  await page.getByTestId("file-version-message").fill("지연 편집 포함");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await page.waitForTimeout(200);
  expect(versionSaveStarted).toBe(false);

  releaseTextWrite?.();
  await expect(page.getByTestId("file-version-status")).toContainText("지연 편집 포함 저장됨");

  const versionsResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}/versions`);
  expect(versionsResponse.ok()).toBeTruthy();
  const versions = (await versionsResponse.json()).versions as Array<{ versionId: string; message: string }>;
  const savedVersion = versions.find((version) => version.message === "지연 편집 포함");
  expect(savedVersion).toBeTruthy();
  const versionResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/versions/${savedVersion!.versionId}`
  );
  expect(versionResponse.ok()).toBeTruthy();
  const savedHeadline = (await versionResponse.json()).version.document.pages[0].children[0].children[0];
  expect(savedHeadline.content.value).toBe("저장 큐 기준");
});

test("file version restore wins after an earlier delayed document write", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("file-version-message").fill("복원 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("복원 기준 저장됨");

  let releaseTextWrite: (() => void) | undefined;
  const textWriteRelease = new Promise<void>((resolve) => {
    releaseTextWrite = resolve;
  });
  let markTextWriteStarted: (() => void) | undefined;
  const textWriteStarted = new Promise<void>((resolve) => {
    markTextWriteStarted = resolve;
  });
  let restoreStarted = false;

  await page.route(`**/files/${documentId}/agent/commands`, async (route) => {
    const body = route.request().postDataJSON() as {
      commands?: Array<{ type?: string }>;
    };
    if (body.commands?.some((command) => command.type === "update_text")) {
      markTextWriteStarted?.();
      await textWriteRelease;
    }
    await route.continue();
  });
  await page.route(`**/files/${documentId}/versions/*/restore`, async (route) => {
    restoreStarted = true;
    await route.continue();
  });

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("복원보다 먼저 끝날 편집");
  await textWriteStarted;
  await page.getByRole("button", { name: "복원 기준 복원" }).click();
  await page.waitForTimeout(200);
  expect(restoreStarted).toBe(false);

  releaseTextWrite?.();
  await expect(page.getByTestId("file-version-status")).toContainText("복원 기준 복원됨");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("Layo");
});

test("file version restore captures collaboration state after an earlier queued write", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }

  const imageTransfer = await createImageDataTransfer(
    page,
    "queued-fit-before-restore.png",
    { width: 900, height: 300 },
    "#2563eb"
  );
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: imageTransfer,
    clientX: stageBox.x + 420,
    clientY: stageBox.y + 320
  });
  await expect(page.getByRole("button", { name: "이미지 3" })).toBeVisible();

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await openFilePanel(page);
  await page.getByTestId("file-version-message").fill("이미지 채우기 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("이미지 채우기 기준 저장됨");

  let releaseFitWrite = () => {};
  const fitWriteRelease = new Promise<void>((resolve) => {
    releaseFitWrite = resolve;
  });
  let markFitWriteStarted = () => {};
  const fitWriteStarted = new Promise<void>((resolve) => {
    markFitWriteStarted = resolve;
  });
  let restoreStarted = false;
  await page.route(`**/files/${documentId}/nodes/image-3/image-fit`, async (route) => {
    markFitWriteStarted();
    await fitWriteRelease;
    await route.continue();
  });
  await page.route(`**/files/${documentId}/versions/*/restore`, async (route) => {
    restoreStarted = true;
    await route.continue();
  });

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  const menu = page.getByTestId("object-context-menu");
  await menu.getByRole("menuitem", { name: "이미지 맞춤" }).click();
  await fitWriteStarted;
  await openFilePanel(page);
  await page.getByRole("button", { name: "이미지 채우기 기준 복원" }).click();
  await page.waitForTimeout(200);
  expect(restoreStarted).toBe(false);

  releaseFitWrite();
  await expect(page.getByTestId("file-version-status")).toContainText("이미지 채우기 기준 복원됨");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      const image = (await response.json()).file.pages[0].children.find(
        (node: { id: string }) => node.id === "image-3"
      );
      return image.content.fit_mode ?? "fill";
    })
    .toBe("fill");

  await page.mouse.click(stageBox.x + 420, stageBox.y + 320, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: "이미지 맞춤" })).toBeEnabled();
});

test("a delayed restore does not mutate a replacement collaboration session", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("file-version-message").fill("세션 교체 복원 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("세션 교체 복원 기준 저장됨");

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("새 세션에서 보존할 편집");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("새 세션에서 보존할 편집");

  let markRestoreResponsePending = () => {};
  const restoreResponsePending = new Promise<void>((resolve) => {
    markRestoreResponsePending = resolve;
  });
  let releaseRestoreResponse = () => {};
  const restoreResponseRelease = new Promise<void>((resolve) => {
    releaseRestoreResponse = resolve;
  });
  await page.route(`**/files/${documentId}/versions/*/restore`, async (route) => {
    const response = await route.fetch();
    markRestoreResponsePending();
    await restoreResponseRelease;
    await route.fulfill({ response });
  });

  await openFilePanel(page);
  await page.getByRole("button", { name: "세션 교체 복원 기준 복원" }).click();
  await restoreResponsePending;
  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByTestId("team-name").fill("교체 디자인 팀");
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("교체 디자인 팀");

  releaseRestoreResponse();
  await openFilePanel(page);
  await expect(page.getByTestId("file-version-status")).toContainText(
    "협업 세션이 변경되어 복원을 적용하지 않았습니다"
  );
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("새 세션에서 보존할 편집");
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("새 세션에서 보존할 편집");
});

test("a delayed restore persistence aborts after collaboration session replacement", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("file-version-message").fill("저장 중 세션 교체 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("저장 중 세션 교체 기준 저장됨");

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("저장 대기 전 현재 편집");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("저장 대기 전 현재 편집");

  let markRestorePersistencePending = () => {};
  const restorePersistencePending = new Promise<void>((resolve) => {
    markRestorePersistencePending = resolve;
  });
  let releaseRestorePersistence = () => {};
  const restorePersistenceRelease = new Promise<void>((resolve) => {
    releaseRestorePersistence = resolve;
  });
  let restorePersistenceCount = 0;
  await page.route(`**/files/${documentId}`, async (route) => {
    if (route.request().method() === "PUT") {
      restorePersistenceCount += 1;
      if (restorePersistenceCount === 1) {
        markRestorePersistencePending();
        await restorePersistenceRelease;
      }
    }
    await route.continue();
  });

  await openFilePanel(page);
  await page.getByRole("button", { name: "저장 중 세션 교체 기준 복원" }).click();
  await restorePersistencePending;
  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByTestId("team-name").fill("저장 중 교체 디자인 팀");
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("저장 중 교체 디자인 팀");
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  const replacementSessionText = await page.getByTestId("inspector-text").inputValue();
  expect(replacementSessionText).toBe("저장 대기 전 현재 편집");

  releaseRestorePersistence();
  await openFilePanel(page);
  await expect(page.getByTestId("file-version-status")).toContainText(
    "협업 세션이 변경되어 복원을 적용하지 않았습니다"
  );
  expect(restorePersistenceCount).toBeGreaterThanOrEqual(1);
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe(replacementSessionText);
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue(replacementSessionText);
});

test("a delayed restore compensates the original file after switching projects", async ({ page }) => {
  await openEmptyEditor(page);
  const firstProjectId = await createNamedProject(page, "복원 전환 A");
  const secondProjectId = await createNamedProject(page, "복원 전환 B");
  const firstProjectResponse = await page.request.get(
    `http://127.0.0.1:4317/projects/${firstProjectId}`
  );
  const firstDocumentId = (await firstProjectResponse.json()).project.currentDocumentId as string;
  await page.getByTestId("project-switcher").selectOption(firstProjectId);
  await expect(page.getByTestId("project-status")).toContainText("복원 전환 A 불러옴");

  await page.getByTestId("file-version-message").fill("프로젝트 전환 복원 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("프로젝트 전환 복원 기준 저장됨");
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("프로젝트 전환 전 현재 편집");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${firstDocumentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("프로젝트 전환 전 현재 편집");

  let markRestoreResponsePending = () => {};
  const restoreResponsePending = new Promise<void>((resolve) => {
    markRestoreResponsePending = resolve;
  });
  let releaseRestoreResponse = () => {};
  const restoreResponseRelease = new Promise<void>((resolve) => {
    releaseRestoreResponse = resolve;
  });
  await page.route(`**/files/${firstDocumentId}/versions/*/restore`, async (route) => {
    const response = await route.fetch();
    markRestoreResponsePending();
    await restoreResponseRelease;
    await route.fulfill({ response });
  });

  await openFilePanel(page);
  await page.getByRole("button", { name: "프로젝트 전환 복원 기준 복원" }).click();
  await restoreResponsePending;
  await page.getByTestId("project-switcher").selectOption(secondProjectId);
  releaseRestoreResponse();

  await expect(page.getByTestId("project-status")).toContainText("복원 전환 B 불러옴");
  await expect(page.getByTestId("project-switcher")).toHaveValue(secondProjectId);
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${firstDocumentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("프로젝트 전환 전 현재 편집");
});

test("project duplication waits for a pending restore compensation", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await openFilePanel(page);
  await page.getByTestId("file-version-message").fill("복제 대기 복원 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("복제 대기 복원 기준 저장됨");
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("복제 전 현재 편집");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("복제 전 현재 편집");

  let markRestoreResponsePending = () => {};
  const restoreResponsePending = new Promise<void>((resolve) => {
    markRestoreResponsePending = resolve;
  });
  let releaseRestoreResponse = () => {};
  const restoreResponseRelease = new Promise<void>((resolve) => {
    releaseRestoreResponse = resolve;
  });
  await page.route(`**/files/${documentId}/versions/*/restore`, async (route) => {
    const response = await route.fetch();
    markRestoreResponsePending();
    await restoreResponseRelease;
    await route.fulfill({ response });
  });

  await openFilePanel(page);
  await page.getByRole("button", { name: "복제 대기 복원 기준 복원" }).click();
  await restoreResponsePending;
  await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
  releaseRestoreResponse();
  await expect(page.getByTestId("project-status")).toContainText("프로젝트 복제됨");

  const duplicateProjectId = await page.getByTestId("project-switcher").inputValue();
  const duplicateProjectResponse = await page.request.get(
    `http://127.0.0.1:4317/projects/${duplicateProjectId}`
  );
  const duplicateDocumentId = (await duplicateProjectResponse.json()).project.currentDocumentId as string;
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${duplicateDocumentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("복제 전 현재 편집");
});

test("failed restore compensation blocks project duplication", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const sourceProjectId = await page.getByTestId("project-switcher").inputValue();
  const initialProjectsResponse = await page.request.get("http://127.0.0.1:4317/projects");
  const initialProjectCount = (await initialProjectsResponse.json()).projects.length as number;

  await openFilePanel(page);
  await page.getByTestId("file-version-message").fill("보상 실패 복원 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("보상 실패 복원 기준 저장됨");
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("보상 실패 전 현재 편집");
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      return (await response.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("보상 실패 전 현재 편집");

  let markRestoreResponsePending = () => {};
  const restoreResponsePending = new Promise<void>((resolve) => {
    markRestoreResponsePending = resolve;
  });
  let releaseRestoreResponse = () => {};
  const restoreResponseRelease = new Promise<void>((resolve) => {
    releaseRestoreResponse = resolve;
  });
  await page.route(`**/files/${documentId}/versions/*/restore`, async (route) => {
    const response = await route.fetch();
    markRestoreResponsePending();
    await restoreResponseRelease;
    await route.fulfill({ response });
  });
  await page.route(`**/files/${documentId}`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 503, body: "compensation unavailable" });
      return;
    }
    await route.fallback();
  });
  let duplicateRequestCount = 0;
  await page.route("**/projects/*/duplicate", async (route) => {
    duplicateRequestCount += 1;
    await route.continue();
  });

  await openFilePanel(page);
  await page.getByRole("button", { name: "보상 실패 복원 기준 복원" }).click();
  await restoreResponsePending;
  await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
  releaseRestoreResponse();

  await expect(page.getByTestId("project-status")).toContainText("문서 저장 실패: 503");
  expect(duplicateRequestCount).toBe(0);
  await expect(page.getByTestId("project-switcher")).toHaveValue(sourceProjectId);
  const finalProjectsResponse = await page.request.get("http://127.0.0.1:4317/projects");
  expect((await finalProjectsResponse.json()).projects).toHaveLength(initialProjectCount);
});

test("a pending project duplication blocks a new restore", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await openFilePanel(page);
  await page.getByTestId("file-version-message").fill("전환 잠금 복원 기준");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("전환 잠금 복원 기준 저장됨");

  let markDuplicatePending = () => {};
  const duplicatePending = new Promise<void>((resolve) => {
    markDuplicatePending = resolve;
  });
  let releaseDuplicate = () => {};
  const duplicateRelease = new Promise<void>((resolve) => {
    releaseDuplicate = resolve;
  });
  await page.route("**/projects/*/duplicate", async (route) => {
    markDuplicatePending();
    await duplicateRelease;
    await route.continue();
  });
  let restoreRequestCount = 0;
  await page.route("**/files/*/versions/*/restore", async (route) => {
    restoreRequestCount += 1;
    await route.continue();
  });

  await page.getByRole("button", { name: "현재 프로젝트 복제" }).click();
  await duplicatePending;
  await page.getByRole("button", { name: "전환 잠금 복원 기준 복원" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText(
    "프로젝트 전환 중에는 버전을 복원할 수 없습니다"
  );
  expect(restoreRequestCount).toBe(0);

  releaseDuplicate();
  await expect(page.getByTestId("project-status")).toContainText("프로젝트 복제됨");
});

test("project navigation waits for a delayed version save without leaking its version list", async ({ page }) => {
  await openEmptyEditor(page);
  const firstProjectId = await createNamedProject(page, "버전 지연 A");
  const secondProjectId = await createNamedProject(page, "버전 지연 B");
  const firstProjectResponse = await page.request.get(
    `http://127.0.0.1:4317/projects/${firstProjectId}`
  );
  const firstDocumentId = (await firstProjectResponse.json()).project.currentDocumentId as string;
  await page.getByTestId("project-switcher").selectOption(firstProjectId);
  await expect(page.getByTestId("project-status")).toContainText("버전 지연 A 불러옴");

  let releaseVersionSave!: () => void;
  const versionSaveRelease = new Promise<void>((resolve) => {
    releaseVersionSave = resolve;
  });
  let markVersionSaveStarted!: () => void;
  const versionSaveStarted = new Promise<void>((resolve) => {
    markVersionSaveStarted = resolve;
  });
  await page.route(`**/files/${firstDocumentId}/versions`, async (route) => {
    if (route.request().method() === "POST") {
      markVersionSaveStarted();
      await versionSaveRelease;
    }
    await route.continue();
  });

  await page.getByTestId("file-version-message").fill("A 전용 버전");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await versionSaveStarted;
  await page.getByTestId("project-switcher").selectOption(secondProjectId);
  await page.waitForTimeout(250);
  await expect(page.getByTestId("project-status")).toContainText("버전 지연 A 불러옴");
  releaseVersionSave();

  await expect(page.getByTestId("project-status")).toContainText("버전 지연 B 불러옴");
  await expect(page.getByTestId("project-switcher")).toHaveValue(secondProjectId);
  await expect(page.getByTestId("file-version-list")).not.toContainText("A 전용 버전");
});

test("a delayed project document response cannot replace the last selected project", async ({ page }) => {
  await openEmptyEditor(page);
  const firstProjectId = await createNamedProject(page, "문서 지연 A");
  const secondProjectId = await createNamedProject(page, "문서 지연 B");
  const firstProjectResponse = await page.request.get(
    `http://127.0.0.1:4317/projects/${firstProjectId}`
  );
  const firstDocumentId = (await firstProjectResponse.json()).project.currentDocumentId as string;
  let releaseFirstDocument!: () => void;
  const firstDocumentRelease = new Promise<void>((resolve) => {
    releaseFirstDocument = resolve;
  });
  let markFirstDocumentStarted!: () => void;
  const firstDocumentStarted = new Promise<void>((resolve) => {
    markFirstDocumentStarted = resolve;
  });
  await page.route(`**/files/${firstDocumentId}`, async (route) => {
    if (route.request().method() === "GET") {
      markFirstDocumentStarted();
      await firstDocumentRelease;
    }
    await route.continue();
  });

  await page.getByTestId("project-switcher").selectOption(firstProjectId);
  await firstDocumentStarted;
  await page.getByTestId("project-switcher").selectOption(secondProjectId);
  await expect(page.getByTestId("project-status")).toContainText("문서 지연 B 불러옴");
  releaseFirstDocument();

  await page.waitForTimeout(350);
  await expect(page.getByTestId("project-switcher")).toHaveValue(secondProjectId);
  await expect(page.getByTestId("project-name")).toHaveValue("문서 지연 B");
  await expect(page.getByTestId("project-status")).toContainText("문서 지연 B 불러옴");
});

test("a rejected stale project document request cannot replace the active status", async ({ page }) => {
  await openEmptyEditor(page);
  const firstProjectId = await createNamedProject(page, "실패 지연 A");
  const secondProjectId = await createNamedProject(page, "실패 지연 B");
  const firstProjectResponse = await page.request.get(
    `http://127.0.0.1:4317/projects/${firstProjectId}`
  );
  const firstDocumentId = (await firstProjectResponse.json()).project.currentDocumentId as string;
  let rejectFirstDocument!: () => void;
  const rejectFirstDocumentRequest = new Promise<void>((resolve) => {
    rejectFirstDocument = resolve;
  });
  let markFirstDocumentStarted!: () => void;
  const firstDocumentStarted = new Promise<void>((resolve) => {
    markFirstDocumentStarted = resolve;
  });
  await page.route(`**/files/${firstDocumentId}`, async (route) => {
    if (route.request().method() === "GET") {
      markFirstDocumentStarted();
      await rejectFirstDocumentRequest;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.getByTestId("project-switcher").selectOption(firstProjectId);
  await firstDocumentStarted;
  await page.getByTestId("project-switcher").selectOption(secondProjectId);
  await expect(page.getByTestId("project-status")).toContainText("실패 지연 B 불러옴");
  rejectFirstDocument();

  await page.waitForTimeout(350);
  await expect(page.getByTestId("project-switcher")).toHaveValue(secondProjectId);
  await expect(page.getByTestId("project-status")).toContainText("실패 지연 B 불러옴");
});

test("file version history previews the saved canvas in read-only mode", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const savedColorResponse = await page.request.post(
    `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
    { data: { dryRun: false, commands: [{ type: "set_fill", nodeId: "frame-1", fill: "#16a34a" }] } }
  );
  expect(savedColorResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);
  await expect.poll(async () => (await findCanvasColorBounds(page, { r: 22, g: 163, b: 74 })).count).toBeGreaterThan(1_000);

  await page.getByTestId("file-version-message").fill("검토 전");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-list")).toContainText("검토 전");
  const versionsResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/versions`
  );
  expect(versionsResponse.ok()).toBeTruthy();
  const savedVersion = ((await versionsResponse.json()).versions as Array<{
    versionId: string;
    message: string;
  }>)
    .find((version) => version.message === "검토 전");
  expect(savedVersion).toBeTruthy();

  const currentColorResponse = await page.request.post(
    `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
    { data: { dryRun: false, commands: [{ type: "set_fill", nodeId: "frame-1", fill: "#2563eb" }] } }
  );
  expect(currentColorResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  await expect
    .poll(async () => {
      const changedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      if (!changedResponse.ok()) {
        return "request failed";
      }
      return (await changedResponse.json()).file.pages[0].children[0].style.fill;
    })
    .toBe("#2563eb");

  await expect.poll(async () => (await findCanvasColorBounds(page, { r: 37, g: 99, b: 235 })).count).toBeGreaterThan(1_000);

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일" }).click();

  let releasePreviewRequest = () => {};
  const previewRequestRelease = new Promise<void>((resolve) => {
    releasePreviewRequest = resolve;
  });
  let markPreviewRequestStarted = () => {};
  const previewRequestStarted = new Promise<void>((resolve) => {
    markPreviewRequestStarted = resolve;
  });
  await page.route(
    `**/files/${documentId}/versions/${savedVersion!.versionId}`,
    async (route) => {
      markPreviewRequestStarted();
      await previewRequestRelease;
      await route.continue();
    }
  );

  await page.getByRole("button", { name: "헤드라인" }).click();
  const resizeHandleBox = await page.getByTestId("resize-handle-bottom-right").boundingBox();
  if (!resizeHandleBox) {
    throw new Error("preview cancellation test could not find the active resize handle");
  }
  await page.mouse.move(
    resizeHandleBox.x + resizeHandleBox.width / 2,
    resizeHandleBox.y + resizeHandleBox.height / 2
  );
  await page.mouse.down();
  await page.getByRole("button", { name: "검토 전 미리보기" }).evaluate((button: HTMLButtonElement) =>
    button.click()
  );
  await previewRequestStarted;
  await page.mouse.move(resizeHandleBox.x + 80, resizeHandleBox.y + 60);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("file-version-status")).toContainText("미리보기 종료됨");
  releasePreviewRequest();
  await page.waitForTimeout(200);
  await expect(page.getByTestId("file-version-preview-banner")).toHaveCount(0);

  await page.getByRole("button", { name: "검토 전 미리보기" }).click();

  const preview = page.getByTestId("file-version-preview");
  await expect(preview).toContainText("검토 전");
  await expect(preview).toContainText("현재 파일과 비교");
  await expect(preview).toContainText("변경 1");
  await expect(preview).toContainText("frame-1");

  const previewBanner = page.getByTestId("file-version-preview-banner");
  await expect(previewBanner).toContainText("검토 전");
  await expect(previewBanner).toContainText("읽기 전용");
  await expect(page.getByTestId("floating-toolbar")).toHaveAttribute("inert", "");
  await expect(page.locator(".inspector")).toHaveAttribute("inert", "");
  await expect(page.getByTestId("resize-handle-bottom-right")).toHaveCount(0);
  await expect.poll(async () => (await findCanvasColorBounds(page, { r: 22, g: 163, b: 74 })).count).toBeGreaterThan(1_000);

  await page.keyboard.press("Delete");
  const unchangedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(unchangedResponse.ok()).toBeTruthy();
  const unchangedFile = (await unchangedResponse.json()).file;
  const unchangedHeadline = unchangedFile.pages[0].children[0].children[0];
  expect(unchangedFile.pages[0].children[0].style.fill).toBe("#2563eb");
  expect(unchangedHeadline.transform).toMatchObject({
    x: 32,
    y: 40
  });
  expect(unchangedHeadline.size).toMatchObject({
    width: 260,
    height: 48
  });

  const zoomBefore = await floatingToolbarZoom(page, "%").textContent();
  await page.getByTestId("stage-frame").hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 120);
  await page.keyboard.up("Control");
  await expect.poll(async () => floatingToolbarZoom(page, "%").textContent()).not.toBe(zoomBefore);

  await previewBanner.getByRole("button", { name: "미리보기 종료" }).click();
  await expect(preview).toBeHidden();
  await expect(previewBanner).toBeHidden();
  await expect.poll(async () => (await findCanvasColorBounds(page, { r: 37, g: 99, b: 235 })).count).toBeGreaterThan(1_000);

  let collaborativeRestoreSnapshot: {
    baseDocument: { pages: Array<{ children: Array<{ style: { fill: string } }> }> };
    document: { pages: Array<{ children: Array<{ style: { fill: string } }> }> };
  } | null = null;
  await page.route(`**/files/${documentId}`, async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as typeof collaborativeRestoreSnapshot;
      if (body?.baseDocument.pages[0]?.children[0]?.style.fill === "#16a34a") {
        collaborativeRestoreSnapshot = body;
      }
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "검토 전 미리보기" }).click();
  await page.getByTestId("file-version-preview-banner").getByRole("button", { name: "이 버전 복원" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("검토 전 복원됨");
  await expect.poll(() => collaborativeRestoreSnapshot).toMatchObject({
    baseDocument: { pages: [{ children: [{ style: { fill: "#16a34a" } }] }] },
    document: { pages: [{ children: [{ style: { fill: "#16a34a" } }] }] }
  });
  await expect.poll(async () => (await findCanvasColorBounds(page, { r: 22, g: 163, b: 74 })).count).toBeGreaterThan(1_000);

  const restoredResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(restoredResponse.ok()).toBeTruthy();
  expect((await restoredResponse.json()).file.pages[0].children[0].style.fill).toBe("#16a34a");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("복원 후 편집");
  await expect(page.getByTestId("inspector-text")).toHaveValue("복원 후 편집");
  await expect.poll(async () => (await findCanvasColorBounds(page, { r: 22, g: 163, b: 74 })).count).toBeGreaterThan(1_000);

  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      if (!response.ok()) {
        return null;
      }
      const file = (await response.json()).file;
      return {
        fill: file.pages[0].children[0].style.fill,
        text: file.pages[0].children[0].children[0].content.value
      };
    })
    .toEqual({ fill: "#16a34a", text: "복원 후 편집" });
});

test("file version preview ignores a stale response from an older request", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const setFrameFill = async (fill: string) => {
    const response = await page.request.post(
      `http://127.0.0.1:4317/files/${documentId}/agent/commands`,
      { data: { dryRun: false, commands: [{ type: "set_fill", nodeId: "frame-1", fill }] } }
    );
    expect(response.ok()).toBeTruthy();
    await page.reload();
    await openFilePanel(page);
  };
  const saveNamedVersion = async (message: string) => {
    await page.getByTestId("file-version-message").fill(message);
    await page.getByRole("button", { name: "현재 버전 저장" }).click();
    await expect(page.getByTestId("file-version-status")).toContainText(`${message} 저장됨`);
  };

  await setFrameFill("#dc2626");
  await saveNamedVersion("느린 버전");
  await setFrameFill("#16a34a");
  await saveNamedVersion("최신 버전");
  await setFrameFill("#2563eb");

  const versionsResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}/versions`);
  expect(versionsResponse.ok()).toBeTruthy();
  const versions = (await versionsResponse.json()).versions as Array<{ versionId: string; message: string }>;
  const slowVersion = versions.find((version) => version.message === "느린 버전");
  expect(slowVersion).toBeTruthy();

  await page.route(`**/files/${documentId}/versions/${slowVersion!.versionId}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });

  await page.getByRole("button", { name: "느린 버전 미리보기" }).click();
  await page.getByRole("button", { name: "최신 버전 미리보기" }).click();

  const banner = page.getByTestId("file-version-preview-banner");
  await expect(banner).toContainText("최신 버전");
  await expect.poll(async () => (await findCanvasColorBounds(page, { r: 22, g: 163, b: 74 })).count).toBeGreaterThan(1_000);
  await page.waitForTimeout(500);
  await expect(banner).toContainText("최신 버전");
});

test("file version preview cancels an image upload before it mutates the document", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("file-version-message").fill("업로드 전");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("업로드 전 저장됨");

  let releaseUpload: (() => void) | undefined;
  const uploadRelease = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let markUploadStarted: (() => void) | undefined;
  const uploadStarted = new Promise<void>((resolve) => {
    markUploadStarted = resolve;
  });
  await page.route("**/assets", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    markUploadStarted?.();
    await uploadRelease;
    await route.continue();
  });

  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const dropTransfer = await createImageDataTransfer(page, "delayed-preview-image.png");
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: dropTransfer,
    clientX: stageBox.x + 260,
    clientY: stageBox.y + 220
  });
  await uploadStarted;

  await page.getByRole("button", { name: "업로드 전 미리보기" }).click();
  await expect(page.getByTestId("file-version-preview-banner")).toContainText("업로드 전");
  const uploadResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/assets") && response.request().method() === "POST"
  );
  releaseUpload?.();
  const uploadedAsset = (await (await uploadResponsePromise).json()).asset as { assetId: string };

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  const file = (await fileResponse.json()).file;
  expect(flattenNodeKinds(file.pages[0].children).filter((kind) => kind === "image")).toHaveLength(0);
  await expect
    .poll(async () =>
      (await page.request.get(`http://127.0.0.1:4317/assets/${uploadedAsset.assetId}`)).status()
    )
    .toBe(404);
});

test("file version restore cancels an image upload that started before the restore barrier", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("file-version-message").fill("복원 장벽");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("복원 장벽 저장됨");

  let releaseUpload!: () => void;
  const uploadRelease = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let markUploadStarted!: () => void;
  const uploadStarted = new Promise<void>((resolve) => {
    markUploadStarted = resolve;
  });
  await page.route("**/assets", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    markUploadStarted();
    await uploadRelease;
    await route.continue();
  });

  const stageFrame = page.getByTestId("stage-frame");
  const stageBox = await stageFrame.boundingBox();
  if (!stageBox) {
    throw new Error("stage frame was not visible");
  }
  const dropTransfer = await createImageDataTransfer(page, "delayed-restore-image.png");
  await stageFrame.dispatchEvent("drop", {
    dataTransfer: dropTransfer,
    clientX: stageBox.x + 260,
    clientY: stageBox.y + 220
  });
  await uploadStarted;

  await page.getByRole("button", { name: "헤드라인" }).click();
  const resizeHandleBox = await page.getByTestId("resize-handle-bottom-right").boundingBox();
  if (!resizeHandleBox) {
    throw new Error("restore cancellation test could not find the active resize handle");
  }
  await page.mouse.move(
    resizeHandleBox.x + resizeHandleBox.width / 2,
    resizeHandleBox.y + resizeHandleBox.height / 2
  );
  await page.mouse.down();
  await page.getByRole("button", { name: "복원 장벽 복원" }).evaluate((button: HTMLButtonElement) =>
    button.click()
  );
  await expect(page.getByTestId("file-version-status")).toContainText("복원 장벽 복원됨");
  await expect(page.getByRole("button", { name: "복원 장벽 복원" })).toBeEnabled();
  await page.mouse.move(resizeHandleBox.x + 80, resizeHandleBox.y + 60);
  await page.mouse.up();
  const uploadResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/assets") && response.request().method() === "POST"
  );
  releaseUpload();
  const uploadedAsset = (await (await uploadResponsePromise).json()).asset as { assetId: string };

  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      const file = (await response.json()).file;
      return {
        imageCount: flattenNodeKinds(file.pages[0].children).filter((kind) => kind === "image").length,
        headlineSize: file.pages[0].children[0].children[0].size
      };
    })
    .toEqual({ imageCount: 0, headlineSize: { width: 260, height: 48 } });
  await expect
    .poll(async () =>
      (await page.request.get(`http://127.0.0.1:4317/assets/${uploadedAsset.assetId}`)).status()
    )
    .toBe(404);
});

test("file version history pins and unpins recovery checkpoints", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByTestId("file-version-message").fill("릴리즈 검토");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("릴리즈 검토 저장됨");

  const versionRow = () =>
    page.getByTestId("file-version-list").locator(".file-version-row").filter({ hasText: "릴리즈 검토" });

  await versionRow().getByRole("button", { name: "릴리즈 검토 고정" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("릴리즈 검토 고정됨");
  await expect(versionRow()).toContainText("고정됨");

  const pinnedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}/versions`);
  expect(pinnedResponse.ok()).toBeTruthy();
  const pinnedPayload = await pinnedResponse.json();
  expect(
    pinnedPayload.versions.find((version: { message: string; pinned: boolean }) => version.message === "릴리즈 검토")
  ).toMatchObject({ pinned: true });

  await versionRow().getByRole("button", { name: "릴리즈 검토 고정 해제" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("릴리즈 검토 고정 해제됨");
  await expect(versionRow()).not.toContainText("고정됨");
});

test("file version retention deletes and prunes saved versions", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const saveVersion = async (message: string) => {
    await page.getByTestId("file-version-message").fill(message);
    await page.getByRole("button", { name: "현재 버전 저장" }).click();
    await expect(page.getByTestId("file-version-status")).toContainText(`${message} 저장됨`);
  };
  const versionRow = (message: string) =>
    page.getByTestId("file-version-list").locator(".file-version-row").filter({ hasText: message });

  await saveVersion("릴리즈 기준");
  await versionRow("릴리즈 기준").getByRole("button", { name: "릴리즈 기준 고정" }).click();
  await expect(versionRow("릴리즈 기준")).toContainText("고정됨");

  await saveVersion("오래된 작업");
  await saveVersion("최신 작업");
  await versionRow("최신 작업").getByRole("button", { name: "최신 작업 삭제" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("최신 작업 삭제됨");
  await expect(versionRow("최신 작업")).toHaveCount(0);

  await saveVersion("최종 작업");
  await page.getByTestId("file-version-retention-keep").fill("1");
  await page.getByRole("button", { name: "오래된 버전 정리" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("오래된 버전 1개 정리됨");
  await expect(versionRow("릴리즈 기준")).toContainText("고정됨");
  await expect(versionRow("최종 작업")).toHaveCount(1);
  await expect(versionRow("오래된 작업")).toHaveCount(0);

  const versionsResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}/versions`);
  expect(versionsResponse.ok()).toBeTruthy();
  const messages = ((await versionsResponse.json()).versions as Array<{ message: string }>).map(
    (version) => version.message
  );
  expect(messages).toEqual(expect.arrayContaining(["릴리즈 기준", "최종 작업"]));
  expect(messages).not.toContain("오래된 작업");
});

test("comments panel creates and resolves a selected-layer thread", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("comment-panel")).toContainText("헤드라인");
  await page.getByTestId("comment-body").fill("문구 확인 필요");
  await page.getByRole("button", { name: "코멘트 추가" }).click();

  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");
  await expect(page.getByTestId("comment-list")).toContainText("문구 확인 필요");
  await expect(page.getByTestId("comment-list")).toContainText("text-1");

  let createdThreadId = "";
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `http://127.0.0.1:4317/files/${documentId}/comments?includeResolved=true`
      );
      if (!response.ok()) {
        return "";
      }
      const threads = (await response.json()).threads as Array<{
        threadId: string;
        nodeId: string;
        body: string;
        resolvedAt: string | null;
      }>;
      const thread = threads.find((candidate) => candidate.body === "문구 확인 필요");
      createdThreadId = thread?.nodeId === "text-1" && thread.resolvedAt === null ? thread.threadId : "";
      return createdThreadId;
    })
    .not.toBe("");

  await page.getByRole("button", { name: "문구 확인 필요 해결" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 해결됨");
  await expect(page.getByTestId("comment-list")).toContainText("활성 코멘트 없음");

  const resolvedResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/comments?includeResolved=true`
  );
  expect(resolvedResponse.ok()).toBeTruthy();
  const resolvedThread = (await resolvedResponse.json()).threads.find(
    (thread: { threadId: string }) => thread.threadId === createdThreadId
  );
  expect(resolvedThread).toMatchObject({
    nodeId: "text-1",
    body: "문구 확인 필요",
    resolvedAt: expect.any(String)
  });
});

test("comments panel adds replies to a selected-layer thread", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("comment-body").fill("문구 확인 필요");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");

  await page.getByTestId("comment-reply-body").fill("문구를 더 짧게 줄였어요");
  await page.getByRole("button", { name: "답글 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("답글 추가됨");
  await expect(page.getByTestId("comment-list")).toContainText("문구를 더 짧게 줄였어요");
  await expect(page.getByTestId("comment-list")).toContainText("사용자");

  await expect
    .poll(async () => {
      const response = await page.request.get(
        `http://127.0.0.1:4317/files/${documentId}/comments?includeResolved=true`
      );
      if (!response.ok()) {
        return "";
      }
      const threads = (await response.json()).threads as Array<{
        body: string;
        replies: Array<{ body: string; authorName: string }>;
      }>;
      const thread = threads.find((candidate) => candidate.body === "문구 확인 필요");
      return thread?.replies[0]?.body ?? "";
    })
    .toBe("문구를 더 짧게 줄였어요");
});

test("comments panel lets owners edit and delete threads and replies with stale-write recovery", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("comment-body").fill("수정 전 코멘트");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");

  await page.getByRole("button", { name: "수정 전 코멘트 수정" }).click();
  await page.getByTestId("comment-thread-edit-body").fill("수정된 코멘트");
  await page.getByRole("button", { name: "코멘트 저장" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 수정됨");
  await expect(page.getByTestId("comment-list")).toContainText("수정된 코멘트");

  await page.getByTestId("comment-reply-body").fill("수정 전 답글");
  await page.getByRole("button", { name: "답글 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("답글 추가됨");
  await page.getByRole("button", { name: "수정 전 답글 수정" }).click();
  await page.getByTestId("comment-reply-edit-body").fill("수정된 답글");
  await page.getByRole("button", { name: "답글 저장" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("답글 수정됨");
  await expect(page.getByTestId("comment-list")).toContainText("수정된 답글");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "수정된 답글 삭제" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("답글 삭제됨");
  await expect(page.getByTestId("comment-list")).not.toContainText("수정된 답글");

  const foreignResponse = await page.request.post(
    `http://127.0.0.1:4317/files/${documentId}/comments`,
    {
      data: {
        nodeId: "text-1",
        body: "외부 소유 코멘트",
        authorId: "reviewer",
        authorName: "리뷰어"
      }
    }
  );
  expect(foreignResponse.ok()).toBeTruthy();

  await page.reload();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("comment-list")).toContainText("외부 소유 코멘트");
  await expect(page.getByRole("button", { name: "외부 소유 코멘트 수정" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "외부 소유 코멘트 삭제" })).toHaveCount(0);

  await page.getByTestId("comment-body").fill("동시 수정 전");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");

  const threadsResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/comments?includeResolved=true`
  );
  expect(threadsResponse.ok()).toBeTruthy();
  const concurrentThread = ((await threadsResponse.json()).threads as Array<{
    threadId: string;
    body: string;
    modifiedAt: string;
  }>).find((thread) => thread.body === "동시 수정 전");
  expect(concurrentThread).toBeDefined();

  await page.getByRole("button", { name: "동시 수정 전 수정" }).click();
  const threadDraft = page.getByTestId("comment-thread-edit-body");
  await threadDraft.fill("내 오래된 수정");
  const externalUpdate = await page.request.patch(
    `http://127.0.0.1:4317/files/${documentId}/comments/${concurrentThread!.threadId}`,
    {
      data: {
        body: "외부 최신 코멘트",
        actorId: "사용자",
        expectedModifiedAt: concurrentThread!.modifiedAt
      }
    }
  );
  expect(externalUpdate.ok()).toBeTruthy();
  await expect(threadDraft).toHaveValue("내 오래된 수정");

  await page.getByRole("button", { name: "코멘트 저장" }).click();
  await expect(page.getByTestId("comment-status")).toContainText(
    "다른 사용자가 먼저 수정했습니다. 최신 코멘트를 불러왔습니다"
  );
  const latestConflict = page.getByTestId("comment-edit-latest");
  await expect(latestConflict).toContainText("최신 서버 코멘트");
  await expect(latestConflict).toContainText("외부 최신 코멘트");
  await expect(page.getByTestId("comment-list")).toContainText("외부 최신 코멘트");
  await expect(threadDraft).toHaveValue("내 오래된 수정");

  await threadDraft.fill("내 충돌 후 수정");
  await page.getByRole("button", { name: "코멘트 저장" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 수정됨");
  await expect(page.getByTestId("comment-list")).toContainText("내 충돌 후 수정");

  const latestThreadsResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/comments?includeResolved=true`
  );
  expect(latestThreadsResponse.ok()).toBeTruthy();
  const latestConcurrentThread = ((await latestThreadsResponse.json()).threads as Array<{
    threadId: string;
    body: string;
    modifiedAt: string;
  }>).find((thread) => thread.body === "내 충돌 후 수정");
  expect(latestConcurrentThread).toBeDefined();

  await page.getByRole("button", { name: "내 충돌 후 수정 수정" }).click();
  await page.getByTestId("comment-thread-edit-body").fill("원격 삭제에도 보존할 초안");
  const externalDelete = await page.request.delete(
    `http://127.0.0.1:4317/files/${documentId}/comments/${latestConcurrentThread!.threadId}`,
    {
      data: {
        actorId: "사용자",
        expectedModifiedAt: latestConcurrentThread!.modifiedAt
      }
    }
  );
  expect(externalDelete.ok()).toBeTruthy();

  const recovery = page.getByTestId("comment-edit-recovery");
  await expect(recovery).toContainText("원본 코멘트가 삭제되었습니다");
  await expect(page.getByTestId("comment-edit-recovery-body")).toHaveValue(
    "원격 삭제에도 보존할 초안"
  );
  await page.getByRole("button", { name: "삭제된 초안 새 코멘트로 옮기기" }).click();
  await expect(page.getByTestId("comment-body")).toHaveValue("원격 삭제에도 보존할 초안");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");
  await expect(page.getByTestId("comment-list")).toContainText("원격 삭제에도 보존할 초안");

  const recoveredThreadsResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/comments?includeResolved=true`
  );
  expect(recoveredThreadsResponse.ok()).toBeTruthy();
  const recoveredThread = ((await recoveredThreadsResponse.json()).threads as Array<{
    threadId: string;
    body: string;
  }>).find((thread) => thread.body === "원격 삭제에도 보존할 초안");
  expect(recoveredThread).toBeDefined();

  const createdRemoteReply = await page.request.post(
    `http://127.0.0.1:4317/files/${documentId}/comments/${recoveredThread!.threadId}/replies`,
    {
      data: {
        body: "원격 삭제할 답글",
        authorId: "사용자",
        authorName: "사용자"
      }
    }
  );
  expect(createdRemoteReply.ok()).toBeTruthy();
  const createdRemoteReplyPayload = await createdRemoteReply.json();
  const remoteReply = (createdRemoteReplyPayload.thread.replies as Array<{
    replyId: string;
    body: string;
    modifiedAt: string;
  }>).find((reply) => reply.body === "원격 삭제할 답글");
  expect(remoteReply).toBeDefined();

  await page.getByRole("button", { name: "원격 삭제할 답글 수정" }).click();
  await page.getByTestId("comment-reply-edit-body").fill("원격 삭제에도 보존할 답글 초안");
  const deletedRemoteReply = await page.request.delete(
    `http://127.0.0.1:4317/files/${documentId}/comments/${recoveredThread!.threadId}/replies/${remoteReply!.replyId}`,
    {
      data: {
        actorId: "사용자",
        expectedModifiedAt: remoteReply!.modifiedAt
      }
    }
  );
  expect(deletedRemoteReply.ok()).toBeTruthy();

  await expect(recovery).toContainText("원본 답글이 삭제되었습니다");
  await expect(page.getByTestId("comment-edit-recovery-body")).toHaveValue(
    "원격 삭제에도 보존할 답글 초안"
  );
  await page.getByRole("button", { name: "삭제된 초안 답글로 옮기기" }).click();

  const recoveredThreadRow = page
    .getByTestId("comment-list")
    .locator("li.comment-row")
    .filter({ hasText: "원격 삭제에도 보존할 초안" });
  await expect(recoveredThreadRow).toHaveCount(1);
  await expect(recoveredThreadRow.getByTestId("comment-reply-body")).toHaveValue(
    "원격 삭제에도 보존할 답글 초안"
  );
  await recoveredThreadRow.getByRole("button", { name: "답글 추가" }).click();
  await expect(recoveredThreadRow).toContainText("원격 삭제에도 보존할 답글 초안");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "수정된 코멘트 삭제" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 삭제됨");
  await expect(page.getByTestId("comment-list")).not.toContainText("수정된 코멘트");
});

test("deleting the last comment clears its canvas bubble and keeps a content-free activity tombstone", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("comment-body").fill("삭제할 단일 코멘트");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-bubble-text-1")).toHaveText("1");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "삭제할 단일 코멘트 삭제" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 삭제됨");
  await expect(page.getByTestId("comment-bubble-text-1")).toHaveCount(0);

  await openFilePanel(page);
  const activity = page.getByTestId("comment-activity-feed");
  await expect(activity).toContainText("삭제");
  await expect(activity).toContainText("코멘트가 삭제되었습니다");
  await expect(activity).not.toContainText("삭제할 단일 코멘트");

  const activityResponse = await page.request.get(
    "http://127.0.0.1:4317/comments/activity?viewerId=%EC%82%AC%EC%9A%A9%EC%9E%90&limit=8"
  );
  expect(activityResponse.ok()).toBeTruthy();
  expect((await activityResponse.json()).feed.events[0]).toMatchObject({
    type: "deleted",
    fileId: documentId,
    body: "코멘트가 삭제되었습니다",
    mentions: [],
    mentionTargets: []
  });
});

test("comments panel keeps feedback controls available to team viewers and maps trusted actor names", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const teamManifest = {
    schemaVersion: 1,
    teamId: "team-comment-viewers",
    name: "코멘트 검수 팀",
    createdAt: "2026-07-23T00:00:00.000Z",
    currentUserId: "team-viewer",
    members: [
      {
        userId: "team-viewer",
        displayName: "팀 뷰어",
        color: "#2563eb",
        role: "viewer"
      }
    ],
    documents: [],
    sync: { mode: "local", roomPrefix: "layo" },
    permissions: { canEdit: false, canInvite: false },
    auth: { relay: { memberTokenHashes: [], inviteTokenHashes: [] } },
    encryption: { mode: "none" }
  };

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("tab", { name: "팀 설정" }).click();
  await page.getByTestId("team-manifest").fill(JSON.stringify(teamManifest, null, 2));
  await page.getByRole("button", { name: "설정 가져오기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("코멘트 검수 팀");

  await openFilePanel(page);
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("코멘트 검수 팀");

  const created = await page.request.post(
    `http://127.0.0.1:4317/files/${documentId}/comments`,
    {
      data: {
        nodeId: "text-1",
        body: "뷰어 소유 코멘트",
        authorId: "team-viewer",
        authorName: "team-viewer"
      }
    }
  );
  expect(created.ok()).toBeTruthy();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("comment-list")).toContainText("뷰어 소유 코멘트");
  await expect(page.getByTestId("comment-body")).toBeEnabled();
  await expect(page.getByRole("button", { name: "코멘트 추가" })).toBeDisabled();
  await expect(page.getByTestId("comment-reply-body")).toBeEnabled();
  await expect(page.getByRole("button", { name: "답글 추가" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "뷰어 소유 코멘트 수정" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "뷰어 소유 코멘트 삭제" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "뷰어 소유 코멘트 해결" })).toHaveCount(1);

  await page.getByTestId("comment-body").fill("뷰어가 추가한 피드백");
  await expect(page.getByRole("button", { name: "코멘트 추가" })).toBeEnabled();
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");

  await openFilePanel(page);
  await expect(page.getByTestId("comment-activity-feed")).toContainText("팀 뷰어");
  await expect(page.getByTestId("comment-activity-feed")).not.toContainText("team-viewer");
});

test("comments panel shows mentions and marks unread threads read", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const created = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/comments`, {
    data: {
      nodeId: "text-1",
      body: "@민지 문구 확인 필요",
      authorName: "디자인 팀"
    }
  });
  expect(created.ok()).toBeTruthy();
  const threadId = (await created.json()).thread.threadId as string;

  await page.reload();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("comment-list")).toContainText("@민지 문구 확인 필요");
  await expect(page.getByTestId("comment-list")).toContainText("언급 민지");
  await expect(page.getByTestId("comment-list")).toContainText("읽지 않음");
  await expect(page.getByTestId("comment-status")).toContainText("1개 읽지 않은 코멘트");

  await page.getByRole("button", { name: "읽음 처리" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 읽음");
  await expect(page.getByTestId("comment-list")).not.toContainText("읽지 않음");

  const readResponse = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/comments?viewerId=${encodeURIComponent("사용자")}`
  );
  expect(readResponse.ok()).toBeTruthy();
  const readThread = (await readResponse.json()).threads.find(
    (thread: { threadId: string }) => thread.threadId === threadId
  );
  expect(readThread).toMatchObject({
    unread: false,
    readBy: ["디자인 팀", "사용자"]
  });
});

test("comments panel resolves retained team members after switching projects", async ({ page }) => {
  await createProjectFromEmptyState(page);
  const teamManifest = {
    schemaVersion: 1,
    teamId: "team-minji",
    name: "민지 팀",
    createdAt: "2026-06-27T00:00:00.000Z",
    currentUserId: "local-user",
    members: [
      { userId: "local-user", displayName: "로컬 사용자", color: "#0f766e", role: "owner" },
      { userId: "minji", displayName: "민지", color: "#7c3aed", role: "editor" }
    ],
    documents: [],
    sync: { mode: "local", roomPrefix: "layo" },
    permissions: { canEdit: true, canInvite: true },
    auth: { relay: { memberTokenHashes: [], inviteTokenHashes: [] } },
    encryption: { mode: "none" }
  };

  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("tab", { name: "팀 설정" }).click();
  await page.getByTestId("team-manifest").fill(JSON.stringify(teamManifest, null, 2));
  await page.getByRole("button", { name: "설정 가져오기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("민지 팀");

  await openFilePanel(page);
  const sourceProjectId = await page.getByTestId("project-switcher").inputValue();
  await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
  await expect(page.getByTestId("project-switcher")).not.toHaveValue(sourceProjectId);
  await expect(page.getByTestId("project-status")).toContainText("새 프로젝트 저장됨");
  const targetProjectId = await page.getByTestId("project-switcher").inputValue();
  const targetProjectResponse = await page.request.get(
    `http://127.0.0.1:4317/projects/${targetProjectId}`
  );
  expect(targetProjectResponse.ok()).toBeTruthy();
  const documentId = (await targetProjectResponse.json()).project.currentDocumentId as string;
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("민지 팀");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("comment-body").fill("@민지 팀 멘션 확인");
  const commentRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === `/files/${documentId}/comments`
  );
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  expect((await commentRequest).postDataJSON()).toMatchObject({
    mentionTargets: [{ userId: "minji", displayName: "민지", role: "editor" }]
  });
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");
  await expect(page.getByTestId("comment-list")).toContainText("팀 멘션 민지");

  const response = await page.request.get(
    `http://127.0.0.1:4317/files/${documentId}/comments?includeResolved=true`
  );
  expect(response.ok()).toBeTruthy();
  const thread = (await response.json()).threads.find(
    (candidate: { body: string }) => candidate.body === "@민지 팀 멘션 확인"
  );
  expect(thread).toMatchObject({
    mentions: ["민지"],
    mentionTargets: [{ userId: "minji", displayName: "민지", role: "editor" }]
  });
});

test("file panel summarizes unread comments and marks the current file read", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const created = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/comments`, {
    data: {
      nodeId: "text-1",
      body: "@민지 파일 검수 필요",
      authorName: "디자인 팀"
    }
  });
  expect(created.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  const summary = page.getByTestId("comment-notification-summary");
  await expect(summary).toContainText("읽지 않은 코멘트 1개");
  await expect(summary).toContainText("새 문서 1");

  await page.getByTestId("mark-file-comments-read").click();
  await expect(summary).toContainText("읽지 않은 코멘트 없음");

  const readResponse = await page.request.get(
    `http://127.0.0.1:4317/comments/notifications?viewerId=${encodeURIComponent("사용자")}`
  );
  expect(readResponse.ok()).toBeTruthy();
  expect((await readResponse.json()).summary).toMatchObject({
    totalUnread: 0,
    projects: []
  });
});

test("file panel shows mention-targeted comment notifications", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const created = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/comments`, {
    data: {
      nodeId: "text-1",
      body: "@사용자 파일 멘션 확인",
      authorName: "디자인 팀",
      mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
    }
  });
  expect(created.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  const summary = page.getByTestId("comment-notification-summary");
  await expect(summary).toContainText("읽지 않은 코멘트 1개");
  await expect(summary).toContainText("나를 멘션 1개");
  await expect(summary).toContainText("새 문서");
  await expect(summary).toContainText("멘션 1개");
});

test("comment authorization end stops fallback polling and preserves the recovery state", async ({ page }) => {
  await page.addInitScript(() => {
    const instrumentedWindow = window as Window & {
      __layoCommentListRequestCount?: number;
      __layoCommentTerminalStreamCount?: number;
    };
    const nativeFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const parsedUrl = new URL(url, window.location.href);
      if (
        method === "GET"
        && /^\/files\/[^/]+\/comments$/.test(parsedUrl.pathname)
      ) {
        instrumentedWindow.__layoCommentListRequestCount =
          (instrumentedWindow.__layoCommentListRequestCount ?? 0) + 1;
        if (instrumentedWindow.__layoCommentListRequestCount === 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
      }
      if (parsedUrl.pathname === "/comments/events") {
        instrumentedWindow.__layoCommentTerminalStreamCount =
          (instrumentedWindow.__layoCommentTerminalStreamCount ?? 0) + 1;
        return new Response(
          'event: comment-authorization-ended\ndata: {"code":"credential_inactive"}\n\n',
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" }
          }
        );
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });

  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("comment-status")).toContainText(
    "팀 코멘트 접근 권한이 해제되었습니다"
  );

  await page.waitForTimeout(100);
  const requestCountAfterTerminal = await page.evaluate(
    () => (window as Window & { __layoCommentListRequestCount?: number })
      .__layoCommentListRequestCount ?? 0
  );
  await page.waitForTimeout(2_300);
  const requestCountAfterFallbackWindow = await page.evaluate(
    () => (window as Window & { __layoCommentListRequestCount?: number })
      .__layoCommentListRequestCount ?? 0
  );

  expect(requestCountAfterFallbackWindow).toBe(requestCountAfterTerminal);
  await expect.poll(
    () => page.evaluate(
      () => (window as Window & { __layoCommentTerminalStreamCount?: number })
        .__layoCommentTerminalStreamCount ?? 0
    )
  ).toBe(1);
  await expect(page.getByTestId("comment-status")).toContainText(
    "팀 코멘트 접근 권한이 해제되었습니다"
  );
});

test("file panel receives externally created comment notifications without reload", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await openFilePanel(page);
  const summary = page.getByTestId("comment-notification-summary");
  const feed = page.getByTestId("comment-activity-feed");
  await expect(summary).toContainText("읽지 않은 코멘트 없음");
  await expect(feed).toContainText("최근 코멘트 활동 없음");

  const created = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/comments`, {
    data: {
      nodeId: "text-1",
      body: "@사용자 외부 알림 확인",
      authorName: "디자인 팀",
      mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
    }
  });
  expect(created.ok()).toBeTruthy();

  await expect(summary).toContainText("읽지 않은 코멘트 1개", { timeout: 4_000 });
  await expect(summary).toContainText("나를 멘션 1개");
  await expect(summary).toContainText("멘션 1개");
  await expect(feed).toContainText("디자인 팀");
  await expect(feed).toContainText("@사용자 외부 알림 확인");
});

test("file panel receives externally created comment notifications through the event stream", async ({
  page
}) => {
  await page.addInitScript(() => {
    const instrumentedWindow = window as Window & {
      __layoCommentStreamUrls?: string[];
      __layoSuppressedCommentPolling?: boolean;
    };
    const nativeFetch = window.fetch.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);

    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 2_000) {
        instrumentedWindow.__layoSuppressedCommentPolling = true;
        return 0;
      }
      return nativeSetInterval(handler, timeout, ...args);
    }) as typeof window.setInterval;

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const parsedUrl = new URL(url, window.location.href);
      if (parsedUrl.pathname === "/comments/events") {
        instrumentedWindow.__layoCommentStreamUrls = [
          ...(instrumentedWindow.__layoCommentStreamUrls ?? []),
          parsedUrl.toString()
        ];
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });

  const { documentId } = await createProjectFromEmptyState(page);

  await openFilePanel(page);
  const summary = page.getByTestId("comment-notification-summary");
  const feed = page.getByTestId("comment-activity-feed");
  await expect(summary).toContainText("읽지 않은 코멘트 없음");
  await expect(feed).toContainText("최근 코멘트 활동 없음");
  await page.waitForFunction(
    ({ documentId: expectedDocumentId }) => {
      const instrumentedWindow = window as Window & {
        __layoCommentStreamUrls?: string[];
        __layoSuppressedCommentPolling?: boolean;
      };
      return (
        instrumentedWindow.__layoSuppressedCommentPolling === true &&
        (instrumentedWindow.__layoCommentStreamUrls ?? []).some((url) => {
          const parsedUrl = new URL(url, window.location.href);
          return (
            parsedUrl.pathname === "/comments/events" &&
            parsedUrl.searchParams.get("fileId") === expectedDocumentId
          );
        })
      );
    },
    { documentId }
  );

  const created = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/comments`, {
    data: {
      nodeId: "text-1",
      body: "@사용자 이벤트 스트림 확인",
      authorName: "디자인 팀",
      mentionTargets: [{ userId: "사용자", displayName: "사용자", role: "editor" }]
    }
  });
  expect(created.ok()).toBeTruthy();

  await expect(summary).toContainText("읽지 않은 코멘트 1개", { timeout: 1_200 });
  await expect(summary).toContainText("나를 멘션 1개");
  await expect(feed).toContainText("@사용자 이벤트 스트림 확인", { timeout: 1_200 });
});

test("file panel shows retained recent comment activity", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("comment-body").fill("@민지 파일 활동 확인");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");

  await page.getByTestId("comment-reply-body").fill("문구를 더 짧게 줄였어요");
  await page.getByRole("button", { name: "답글 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("답글 추가됨");

  await page.getByRole("button", { name: "@민지 파일 활동 확인 해결" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 해결됨");

  await openFilePanel(page);
  const feed = page.getByTestId("comment-activity-feed");
  await expect(feed).toContainText("최근 코멘트 활동");
  await expect(feed).toContainText("해결");
  await expect(feed).toContainText("답글");
  await expect(feed).toContainText("새 문서 1");
  await expect(feed).toContainText("@민지 파일 활동 확인");
  await expect(feed).toContainText("문구를 더 짧게 줄였어요");

  const response = await page.request.get(
    `http://127.0.0.1:4317/comments/activity?viewerId=${encodeURIComponent("사용자")}&limit=3`
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.feed.events.map((event: { type: string }) => event.type)).toEqual([
    "resolved",
    "replied",
    "created"
  ]);
});

test("canvas comment bubbles open selected-layer threads and disappear after resolve", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("comment-body").fill("문구 확인 필요");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 추가됨");

  const bubble = page.getByTestId("comment-bubble-text-1");
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveText("1");
  await expect(bubble).toHaveAttribute("aria-label", "헤드라인 활성 코멘트 1개");

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByTestId("comment-panel")).toContainText("사각형 3");
  await bubble.click();
  await expect(page.getByTestId("comment-panel")).toContainText("헤드라인");
  await expect(page.getByTestId("comment-list")).toContainText("문구 확인 필요");

  await page.getByRole("button", { name: "문구 확인 필요 해결" }).click();
  await expect(page.getByTestId("comment-status")).toContainText("코멘트 해결됨");
  await expect(bubble).toHaveCount(0);
});

test("file version history shows automatic saved versions from persisted edits", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  for (const value of ["자동 UI 1", "자동 UI 2", "자동 UI 3"]) {
    const response = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
      data: {
        dryRun: false,
        commands: [{ type: "update_text", nodeId: "text-1", value }]
      }
    });
    expect(response.ok()).toBeTruthy();
  }

  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.getByTestId("file-version-list")).toContainText("자동 저장");
});

test("inspector shows fill token binding from agent-applied color tokens", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_token",
          token: {
            id: "color-brand-primary",
            name: "Brand / Primary",
            type: "color",
            value: "#2563eb"
          }
        },
        { type: "set_fill_token", nodeId: "text-1", tokenId: "color-brand-primary" }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();

  await expect(page.getByTestId("inspector-fill")).toHaveValue("#2563eb");
  await expect(page.getByTestId("inspector-fill-token")).toContainText("Brand / Primary");
});

test("right inspector binds imported shadow tokens to effect shadows", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      global: {
        Effects: {
          Card: {
            $type: "shadow",
            $value: {
              x: "0px",
              y: "18px",
              blur: "36px",
              spread: "0px",
              color: "#0f172a",
              opacity: 0.32
            }
          }
        }
      }
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("1개 토큰 가져옴");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-effect-shadow-token").selectOption("shadow-effects-card");
  await expect(page.getByTestId("inspector-effect-shadow")).toHaveValue(
    "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
  );
  await expect(page.getByTestId("inspector-effect-shadow-token-readout")).toContainText("Effects / Card");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const filePayload = await fileResponse.json();
      const textNode = filePayload.file.pages[0].children[0].children.find((node: any) => node.id === "text-1");
      return textNode?.style;
    })
    .toMatchObject({
      effect_shadow: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)",
      effect_shadow_token: "shadow-effects-card"
    });

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-effect-shadow-token")).toHaveValue("shadow-effects-card");
});

test("right inspector creates and applies reusable effect styles", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-effect-shadow").fill("0px 18px 36px 0px rgba(15, 23, 42, 0.32)");
  await page.getByRole("button", { name: "효과 스타일 저장" }).click();
  await page.getByTestId("style-name-input").fill("Effects / Card Raised");
  await page.getByRole("button", { name: "스타일 생성" }).click();

  await expect(page.getByTestId("inspector-effect-shadow-style")).toHaveValue("style-effect-effects-card-raised");
  await expect(page.getByTestId("inspector-effect-shadow-style-readout")).toContainText("Effects / Card Raised");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const filePayload = await fileResponse.json();
      const textNode = filePayload.file.pages[0].children[0].children.find((node: any) => node.id === "text-1");
      return {
        styles: filePayload.file.styles,
        style: textNode?.style
      };
    })
    .toMatchObject({
      styles: [
        {
          id: "style-effect-effects-card-raised",
          name: "Effects / Card Raised",
          type: "effect",
          value: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
        }
      ],
      style: {
        effect_shadow: "0px 18px 36px 0px rgba(15, 23, 42, 0.32)",
        effect_shadow_style: "style-effect-effects-card-raised"
      }
    });

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-effect-shadow-style")).toHaveValue("style-effect-effects-card-raised");
});

test("right inspector edits and persists multi-effect shadow stacks", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const shadows = [
    "0px 1px 2px 0px rgba(15, 23, 42, 0.18)",
    "0px 18px 36px 0px rgba(15, 23, 42, 0.32)"
  ];

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-effect-shadow-stack").fill(shadows.join("\n"));

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const filePayload = await fileResponse.json();
      const textNode = filePayload.file.pages[0].children[0].children.find((node: any) => node.id === "text-1");
      return textNode?.style;
    })
    .toMatchObject({
      effect_shadow: shadows.join(", "),
      effect_shadows: shadows,
      effect_shadow_token: null,
      effect_shadow_style: null
    });

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-effect-shadow-stack")).toHaveValue(shadows.join("\n"));
});

test("right inspector creates and applies reusable styles", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-fill").fill("#2563eb");
  await page.getByRole("button", { name: "색상 스타일 저장" }).click();
  await page.getByTestId("style-name-input").fill("Brand / Primary");
  await page.getByRole("button", { name: "스타일 생성" }).click();

  await expect(page.getByTestId("inspector-fill-style")).toContainText("Brand / Primary");
  await expect(page.getByTestId("style-usage-count-style-color-brand-primary")).toContainText("1곳");

  await page.getByTestId("style-rename-input-style-color-brand-primary").fill("Brand / Accent");
  await page.getByTestId("style-rename-button-style-color-brand-primary").click();
  await expect(page.getByTestId("inspector-fill-style")).toContainText("Brand / Accent");

  await page.getByTestId("style-delete-button-style-color-brand-primary").click();
  await expect(page.getByTestId("inspector-fill-style")).toHaveValue("");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const filePayload = await fileResponse.json();
      const findNode = (nodes: any[], nodeId: string): any =>
        nodes.reduce<any | null>((found, node) => found ?? (node.id === nodeId ? node : findNode(node.children ?? [], nodeId)), null);
      const textNode = findNode(filePayload.file.pages[0].children, "text-1");
      return {
        styles: filePayload.file.styles ?? [],
        fill: textNode?.style?.fill,
        fillStyle: textNode?.style?.fill_style
      };
    })
    .toEqual({ styles: [], fill: "#2563eb", fillStyle: null });
});

test("right inspector organizes reusable styles with search filter sort groups and duplicate", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_style",
          style: {
            id: "style-color-brand-accent",
            name: "Brand / Accent",
            type: "color",
            value: "#2563eb"
          }
        },
        {
          type: "create_style",
          style: {
            id: "style-color-neutral",
            name: "Base / Neutral",
            type: "color",
            value: "#111827"
          }
        },
        {
          type: "create_style",
          style: {
            id: "style-typography-heading",
            name: "Typography / Heading",
            type: "typography",
            value: JSON.stringify({ fontFamily: "Inter", fontSize: 32, lineHeight: 40 })
          }
        },
        { type: "set_fill_style", nodeId: "text-1", styleId: "style-color-brand-accent" }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();

  await expect(page.getByTestId("style-group-brand")).toBeVisible();
  await expect(page.getByTestId("style-management-row-style-color-brand-accent")).toBeVisible();

  await page.getByTestId("style-search-input").fill("Neutral");
  await expect(page.getByTestId("style-management-row-style-color-neutral")).toBeVisible();
  await expect(page.getByTestId("style-management-row-style-color-brand-accent")).toBeHidden();

  await page.getByTestId("style-search-input").fill("");
  await page.getByTestId("style-type-filter").selectOption("typography");
  await expect(page.getByTestId("style-management-row-style-typography-heading")).toBeVisible();
  await expect(page.getByTestId("style-management-row-style-color-brand-accent")).toBeHidden();

  await page.getByTestId("style-type-filter").selectOption("all");
  await page.getByTestId("style-sort-select").selectOption("za");
  const sortedNames = await page
    .getByTestId("style-management-row")
    .evaluateAll((rows) => rows.map((row) => row.querySelector("strong")?.textContent?.trim()));
  expect(sortedNames.slice(0, 3)).toEqual(["Typography / Heading", "Brand / Accent", "Base / Neutral"]);

  await page.getByTestId("style-duplicate-button-style-color-brand-accent").click();
  await expect(page.getByTestId("style-management-row-style-color-brand-accent-copy")).toContainText(
    "Brand / Accent Copy"
  );

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const styles = (await fileResponse.json()).file.styles as Array<{
        id: string;
        name: string;
        type: string;
        value: string;
      }>;
      return styles
        .filter((style) => style.id === "style-color-brand-accent" || style.id === "style-color-brand-accent-copy")
        .map((style) => ({ id: style.id, name: style.name, type: style.type, value: style.value }))
        .sort((left, right) => left.id.localeCompare(right.id));
    })
    .toEqual([
      {
        id: "style-color-brand-accent",
        name: "Brand / Accent",
        type: "color",
        value: "#2563eb"
      },
      {
        id: "style-color-brand-accent-copy",
        name: "Brand / Accent Copy",
        type: "color",
        value: "#2563eb"
      }
    ]);
});

test("right inspector imports and exports DTCG token JSON", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      global: {
        Imported: {
          Highlight: {
            $type: "color",
            $value: "#f97316"
          }
        }
      }
    },
    null,
    2
  );

  await expect(page.getByRole("heading", { name: "토큰" })).toBeVisible();
  await page.getByRole("button", { name: "토큰 내보내기" }).click();
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/\$metadata/);

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("1개 토큰 가져옴");

  const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fileResponse.ok()).toBeTruthy();
  expect((await fileResponse.json()).file.tokens).toEqual([
    {
      id: "color-imported-highlight",
      name: "Imported / Highlight",
      type: "color",
      value: "#f97316"
    }
  ]);

  await page.getByRole("button", { name: "토큰 내보내기" }).click();
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/Imported/);
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/#f97316/);
});

test("right inspector manages imported DTCG token sets", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      $metadata: {
        tokenSetOrder: ["base", "dark"],
        activeTokenSets: ["base", "dark"]
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
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("2개 토큰 가져옴");
  await expect(page.getByTestId("token-set-row-base")).toContainText("base");
  await expect(page.getByTestId("token-set-row-dark")).toContainText("dark");

  await page.getByTestId("token-set-enabled-dark").uncheck();
  await expect(page.getByTestId("token-set-enabled-dark")).not.toBeChecked();

  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(response.ok()).toBeTruthy();
      return (await response.json()).file.token_sets;
    })
    .toEqual([
      { id: "base", name: "base", enabled: true },
      { id: "dark", name: "dark", enabled: false }
    ]);

  await page.getByRole("button", { name: "토큰 내보내기" }).click();
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/"activeTokenSets": \[\s+"base"\s+\]/);
});

test("right inspector activates imported DTCG token themes", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeThemes: ["theme-light"]
      },
      $themes: [
        { id: "theme-light", name: "Light", group: "mode", selectedTokenSets: ["base", "light"] },
        { id: "theme-dark", name: "Dark", group: "mode", selectedTokenSets: ["base", "dark"] }
      ],
      base: {
        Surface: {
          Canvas: {
            $type: "color",
            $value: "#f8fafc"
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
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("3개 토큰 가져옴");
  await expect(page.getByTestId("token-theme-group-mode")).toContainText("mode");
  await expect(page.getByTestId("token-theme-enabled-theme-light")).toBeChecked();
  await expect(page.getByTestId("token-theme-enabled-theme-dark")).not.toBeChecked();

  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [{ type: "set_fill_token", nodeId: "text-1", tokenId: "color-base-surface-canvas" }]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#ffffff");
  await expect(page.getByTestId("inspector-fill-token")).toContainText("Surface / Canvas");

  await page.getByTestId("token-theme-enabled-theme-dark").check();
  await expect(page.getByTestId("token-theme-enabled-theme-light")).not.toBeChecked();
  await expect(page.getByTestId("token-theme-enabled-theme-dark")).toBeChecked();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#0f172a");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const file = (await fileResponse.json()).file;
      const textNode = file.pages[0].children[0].children[0];
      return {
        fill: textNode.style.fill,
        themes: file.token_themes.map((theme: { id: string; enabled: boolean }) => ({
          id: theme.id,
          enabled: theme.enabled
        }))
      };
    })
    .toEqual({
      fill: "#0f172a",
      themes: [
        { id: "theme-light", enabled: false },
        { id: "theme-dark", enabled: true }
      ]
    });
});

test("right inspector creates edits and deletes token themes", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeTokenSets: ["base"]
      },
      base: {
        Surface: {
          Canvas: {
            $type: "color",
            $value: "#f8fafc"
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
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("3개 토큰 가져옴");

  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [{ type: "set_fill_token", nodeId: "text-1", tokenId: "color-base-surface-canvas" }]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#f8fafc");

  await page.getByTestId("token-theme-add").click();
  await expect(page.getByTestId("token-theme-name-theme-1")).toHaveValue("테마 1");
  await page.getByTestId("token-theme-name-theme-1").fill("Review");
  await page.getByTestId("token-theme-group-input-theme-1").fill("mode");
  await page.getByTestId("token-theme-set-theme-1-dark").check();
  await page.getByTestId("token-theme-enabled-theme-1").check();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#0f172a");

  await page.getByTestId("token-theme-set-theme-1-dark").uncheck();
  await page.getByTestId("token-theme-set-theme-1-light").check();
  await page.getByTestId("token-theme-name-theme-1").fill("Light Review");
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#ffffff");

  await page.getByTestId("token-theme-delete-theme-1").click();
  await expect(page.getByTestId("token-theme-name-theme-1")).toHaveCount(0);
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#f8fafc");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const file = (await fileResponse.json()).file;
      return {
        fill: file.pages[0].children[0].children[0].style.fill,
        tokenThemes: file.token_themes ?? []
      };
    })
    .toEqual({ fill: "#f8fafc", tokenThemes: [] });
});

test("right inspector reorders token themes and theme token set priority", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeThemes: ["theme-review"]
      },
      $themes: [
        { id: "theme-review", name: "Review", group: "mode", selectedTokenSets: ["base", "light", "dark"] },
        { id: "theme-alt", name: "Alt", group: "preview", selectedTokenSets: ["base", "light"] }
      ],
      base: {
        Surface: {
          Canvas: {
            $type: "color",
            $value: "#f8fafc"
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
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("3개 토큰 가져옴");

  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [{ type: "set_fill_token", nodeId: "text-1", tokenId: "color-base-surface-canvas" }]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#0f172a");

  await page.getByTestId("token-theme-move-down-theme-review").click();
  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const file = (await fileResponse.json()).file;
      return file.token_themes.map((theme: { id: string }) => theme.id);
    })
    .toEqual(["theme-alt", "theme-review"]);

  await page.getByTestId("token-theme-move-up-theme-review").click();
  await page.getByTestId("token-theme-set-move-down-theme-review-light").click();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#ffffff");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const file = (await fileResponse.json()).file;
      const reviewTheme = file.token_themes.find((theme: { id: string }) => theme.id === "theme-review");
      return {
        order: file.token_themes.map((theme: { id: string }) => theme.id),
        reviewSets: reviewTheme.token_set_ids,
        fill: file.pages[0].children[0].children[0].style.fill
      };
    })
    .toEqual({
      order: ["theme-review", "theme-alt"],
      reviewSets: ["base", "dark", "light"],
      fill: "#ffffff"
    });
});

test("right inspector edits token theme membership through a matrix", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      $metadata: {
        tokenSetOrder: ["base", "light", "dark"],
        activeThemes: ["theme-review"]
      },
      $themes: [
        { id: "theme-review", name: "Review", group: "mode", selectedTokenSets: ["base", "light"] },
        { id: "theme-alt", name: "Alt", group: "preview", selectedTokenSets: ["base"] }
      ],
      base: {
        Surface: {
          Canvas: {
            $type: "color",
            $value: "#f8fafc"
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
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("3개 토큰 가져옴");

  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [{ type: "set_fill_token", nodeId: "text-1", tokenId: "color-base-surface-canvas" }]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();

  await page.reload();
  await openFilePanel(page);
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#ffffff");

  await expect(page.getByTestId("token-theme-matrix")).toBeVisible();
  await expect(page.getByTestId("token-theme-matrix-group-mode")).toContainText("mode");
  await expect(page.getByTestId("token-theme-matrix-row-theme-review")).toContainText("Review");
  await expect(page.getByTestId("token-theme-matrix-priority-theme-review-base")).toHaveText("1");
  await expect(page.getByTestId("token-theme-matrix-priority-theme-review-light")).toHaveText("2");
  await expect(page.getByTestId("token-theme-matrix-cell-theme-review-dark")).not.toBeChecked();

  await page.getByTestId("token-theme-matrix-cell-theme-review-dark").check();
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#0f172a");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const file = (await fileResponse.json()).file;
      const reviewTheme = file.token_themes.find((theme: { id: string }) => theme.id === "theme-review");
      return {
        reviewSets: reviewTheme.token_set_ids,
        fill: file.pages[0].children[0].children[0].style.fill
      };
    })
    .toEqual({
      reviewSets: ["base", "light", "dark"],
      fill: "#0f172a"
    });
});

test("right inspector binds imported spacing tokens to layout gap and padding", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
      global: {
        Spacing: {
          Lg: {
            $type: "dimension",
            $value: "32px"
          }
        }
      }
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("1개 토큰 가져옴");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-gap-token")).toBeVisible();
  await page.getByTestId("inspector-layout-gap-token").selectOption("spacing-spacing-lg");
  await expect(page.getByTestId("inspector-layout-mode")).toHaveValue("auto");
  await expect(page.getByTestId("inspector-layout-gap")).toHaveValue("32");
  await expect(page.getByTestId("inspector-layout-row-gap")).toHaveValue("32");
  await expect(page.getByTestId("inspector-layout-column-gap")).toHaveValue("32");

  await page.getByTestId("inspector-layout-padding-token").selectOption("spacing-spacing-lg");
  await expect(page.getByTestId("inspector-layout-padding-top")).toHaveValue("32");
  await expect(page.getByTestId("inspector-layout-padding-right")).toHaveValue("32");
  await expect(page.getByTestId("inspector-layout-padding-bottom")).toHaveValue("32");
  await expect(page.getByTestId("inspector-layout-padding-left")).toHaveValue("32");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const frame = (await fileResponse.json()).file.pages[0].children[0];
      return frame.layout;
    })
    .toEqual(
      expect.objectContaining({
        gap: 32,
        row_gap: 32,
        column_gap: 32,
        padding: { top: 32, right: 32, bottom: 32, left: 32 },
        spacing_tokens: {
          gap: "spacing-spacing-lg",
          row_gap: "spacing-spacing-lg",
          column_gap: "spacing-spacing-lg",
          padding_top: "spacing-spacing-lg",
          padding_right: "spacing-spacing-lg",
          padding_bottom: "spacing-spacing-lg",
          padding_left: "spacing-spacing-lg"
        }
      })
    );

  await page.getByRole("button", { name: "토큰 내보내기" }).click();
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/"Spacing"/);
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/"dimension"/);
});

test("right inspector binds imported typography tokens to text layers", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const importedTokenJson = JSON.stringify(
    {
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
    },
    null,
    2
  );

  await page.getByTestId("dtcg-token-json").fill(importedTokenJson);
  await page.getByRole("button", { name: "토큰 가져오기" }).click();
  await expect(page.getByTestId("dtcg-token-status")).toContainText("1개 토큰 가져옴");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text-typography-token")).toBeVisible();
  await page.getByTestId("inspector-text-typography-token").selectOption("typography-typography-heading-lg");

  await expect
    .poll(async () => {
      const fileResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      expect(fileResponse.ok()).toBeTruthy();
      const textNode = (await fileResponse.json()).file.pages[0].children[0].children[0];
      return textNode.content;
    })
    .toMatchObject({
      type: "text",
      font_family: "Inter",
      font_size: 32,
      typography_token: "typography-typography-heading-lg"
    });

  await page.getByRole("button", { name: "토큰 내보내기" }).click();
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/"typography"/);
  await expect(page.getByTestId("dtcg-token-json")).toHaveValue(/"fontSize": 32/);
});

test("Figma-like edit shortcuts duplicate and delete selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("Control+D");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toHaveCount(0);
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  await page.keyboard.press("Control+Z");
  await expect(page.getByRole("button", { name: "헤드라인 복사본" })).toBeVisible();
});

test("keyboard history persists and remains the base for later collaborative edits", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  await page.getByTestId("editor-rail").getByRole("button", { name: "팀" }).click();
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("디자인 팀");
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();

  await page.getByRole("button", { name: "헤드라인" }).click();
  const originalX = Number(await page.getByTestId("inspector-x").inputValue());
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("inspector-x")).toHaveValue(String(originalX + 1));
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("inspector-x")).toHaveValue(String(originalX));
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("inspector-x")).toHaveValue(String(originalX + 1));

  await page.getByTestId("inspector-text").fill("히스토리 수렴");
  await expect(page.getByTestId("inspector-x")).toHaveValue(String(originalX + 1));
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      const headline = (await response.json()).file.pages[0].children[0].children[0];
      return { x: headline.transform.x, text: headline.content.value };
    })
    .toEqual({ x: originalX + 1, text: "히스토리 수렴" });

  await page.reload();
  await page.getByTestId("editor-rail").getByRole("button", { name: "레이어" }).click();
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue(String(originalX + 1));
  await expect(page.getByTestId("inspector-text")).toHaveValue("히스토리 수렴");
});

test("Figma-like object clipboard copies and pastes selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");

  const firstPaste = page.getByRole("button", { name: "헤드라인 복사본" });
  await expect(firstPaste).toBeVisible();
  await expect(firstPaste).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-x")).toHaveValue("56");
  await expect(page.getByTestId("inspector-y")).toHaveValue("64");
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");

  await page.keyboard.press("Control+V");
  const secondPaste = page.getByRole("button", { name: "헤드라인 복사본 2" });
  await expect(secondPaste).toBeVisible();
  await expect(secondPaste).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-x")).toHaveValue("80");
  await expect(page.getByTestId("inspector-y")).toHaveValue("88");

  await page.keyboard.press("Control+Z");
  await expect(secondPaste).toHaveCount(0);
  await expect(firstPaste).toBeVisible();
});

test("Figma-like object clipboard cuts selected layers with the menu shortcut", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.keyboard.press("Control+X");

  await expect(page.getByRole("button", { name: "헤드라인" })).toHaveCount(0);
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  await page.keyboard.press("Control+V");
  const pastedLayer = page.getByRole("button", { name: "헤드라인 복사본" });
  await expect(pastedLayer).toBeVisible();
  await expect(pastedLayer).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");
});

test("Figma-like grouping shortcuts mirror object menu grouping", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();

  await firstRectangle.click();
  await secondRectangle.click({ modifiers: ["Shift"] });
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Control+G");
  const groupLayer = page.getByRole("button", { name: /그룹 \d+/ });
  await expect(groupLayer).toBeVisible();
  await expect(groupLayer).toHaveClass(/is-selected/);

  await page.keyboard.press("Control+Shift+G");
  await expect(groupLayer).toHaveCount(0);
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();
});

test("Figma-like alignment shortcuts mirror object menu alignment", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("760");
  await expect(page.getByTestId("inspector-x")).toHaveValue("760");

  await rectangleLayer.click({ modifiers: ["Shift"] });
  await headlineLayer.click({ modifiers: ["Shift"] });
  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Alt+A");
  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("152");
});

test("Figma-like selection shortcuts mirror object menu selection and fit actions", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await expect(firstRectangle).toBeVisible();
  await expect(secondRectangle).toBeVisible();

  await firstRectangle.click();
  await page.keyboard.press("Control+Shift+A");
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();
  await expect(firstRectangle).toHaveClass(/is-selected/);
  await expect(secondRectangle).toHaveClass(/is-selected/);

  await page.keyboard.press("Control+A");
  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Shift+1");
  await expect(page.getByTestId("floating-toolbar").locator(".zoom-readout")).not.toHaveText("100%");
});

test("Figma-like style and rename shortcuts mirror object menu edit actions", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#f97316");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-fill").fill("#38bdf8");

  const firstRectangle = page.getByRole("button", { name: "사각형 3" });
  const secondRectangle = page.getByRole("button", { name: "사각형 4" });
  await firstRectangle.click();
  await page.keyboard.press("Control+Alt+C");

  await secondRectangle.click();
  await page.keyboard.press("Control+Alt+V");
  await expect(page.getByRole("button", { name: "사각형 3 복사본" })).toHaveCount(0);
  await expect(secondRectangle).toHaveClass(/is-selected/);
  await expect(page.getByTestId("inspector-fill")).toHaveValue("#f97316");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("레이어 이름");
    await dialog.accept("단축키 레이어");
  });
  await page.keyboard.press("Control+R");
  await expect(page.getByRole("button", { name: /^단축키 레이어/ })).toBeVisible();
});

test("Figma-like multi-selection supports Shift-click and area selection", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  await expect(rectangleLayer).toBeVisible();

  await page.keyboard.down("Shift");
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 100, stageBox.y + 70);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 240, stageBox.y + 180);
  await expect(page.getByTestId("area-selection-box")).toBeVisible();
  await page.mouse.move(stageBox.x + 455, stageBox.y + 262);
  await page.mouse.up();

  await expect(page.getByTestId("area-selection-box")).toHaveCount(0);
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();
});

test("Figma-like multi-selection drags together and shows snap guides", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const targetLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(targetLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("480");
  await page.getByTestId("inspector-y").fill("130");
  await expect(page.getByTestId("inspector-x")).toHaveValue("480");

  await rectangleLayer.click();
  await page.keyboard.down("Shift");
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(targetLayer).not.toHaveClass(/is-selected/);
  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 220, stageBox.y + 180);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 285, stageBox.y + 180);
  await expect(page.getByTestId("snap-guide-vertical")).toBeVisible();
  await page.mouse.up();

  await expect(page.getByText("2개 레이어 선택됨")).toBeVisible();
  await expect(page.getByTestId("snap-guide-vertical")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();
  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("245");
  await headlineLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("97");
});

test("multi-selection drag preview preserves sub-pixel movement while zoomed", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  await expect(rectangleLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("40");
  await page.getByTestId("inspector-y").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("40");
  await expect(page.getByTestId("inspector-y")).toHaveValue("40");

  for (let index = 0; index < 12; index += 1) {
    await page.getByRole("button", { name: "확대" }).click();
  }
  await expect(floatingToolbarZoom(page, "400%")).toBeVisible();

  await rectangleLayer.click();
  await page.keyboard.down("Shift");
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(headlineLayer).toHaveClass(/is-selected/);

  const beforeDrag = await findCanvasColorBounds(page, { r: 224, g: 242, b: 254 });
  await page.mouse.move(beforeDrag.left + 80, beforeDrag.top + 80);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.left + 83, beforeDrag.top + 80);
  await page.waitForTimeout(100);

  const duringDrag = await findCanvasColorBounds(page, { r: 224, g: 242, b: 254 });
  expect(duringDrag.left).toBeGreaterThanOrEqual(beforeDrag.left + 2.75);
  expect(duringDrag.left).toBeLessThan(beforeDrag.left + 3.25);

  await page.mouse.up();
});

test("Figma-like alignment and distribution inspector controls selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await expect(page.getByRole("button", { name: "왼쪽 정렬" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "가로 분배" })).toHaveCount(0);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("760");
  await expect(page.getByTestId("inspector-x")).toHaveValue("760");

  await page.keyboard.down("Shift");
  await rectangleLayer.click();
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await expect(headlineLayer).toHaveClass(/is-selected/);
  await expect(rectangleLayer).toHaveClass(/is-selected/);
  await expect(helperTextLayer).toHaveClass(/is-selected/);
  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();

  await page.getByRole("button", { name: "검사기 왼쪽 맞춤" }).click();
  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("152");

  await page.keyboard.press("Control+Z");
  await helperTextLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("760");

  await page.keyboard.down("Shift");
  await rectangleLayer.click();
  await headlineLayer.click();
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "검사기 가로 간격 균등" }).click();

  await rectangleLayer.click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("506");
});

test("inspector alignment controls expose grouped tooltips and disabled distribution state", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "헤드라인" }).click();

  await expect(page.getByTestId("inspector-align-group").getByRole("button")).toHaveCount(6);
  await expect(page.getByTestId("inspector-distribute-group").getByRole("button")).toHaveCount(2);

  const leftAlign = page.getByRole("button", { name: "검사기 왼쪽 맞춤" });
  const horizontalDistribute = page.getByRole("button", { name: "검사기 가로 간격 균등" });
  await expect(leftAlign).toBeEnabled();
  await expect(leftAlign).toHaveAttribute("title", "왼쪽 맞춤");
  await expect(horizontalDistribute).toBeDisabled();
  await expect(horizontalDistribute).toHaveAttribute("title", "가로 간격 균등");
  await expect(horizontalDistribute).toHaveClass(/is-disabled/);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await headlineLayer.click();
  await rectangleLayer.click({ modifiers: ["Shift"] });
  await helperTextLayer.click({ modifiers: ["Shift"] });

  await expect(horizontalDistribute).toBeEnabled();
  await expect(horizontalDistribute).not.toHaveClass(/is-disabled/);
});

test("multi-selection group bounds show combined dimensions without resize handles", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "텍스트 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  const helperTextLayer = page.getByRole("button", { name: "텍스트 4" });
  await expect(rectangleLayer).toBeVisible();
  await expect(helperTextLayer).toBeVisible();

  await headlineLayer.click();
  await rectangleLayer.click({ modifiers: ["Shift"] });
  await helperTextLayer.click({ modifiers: ["Shift"] });

  await expect(page.getByText("3개 레이어 선택됨")).toBeVisible();
  await expect(page.getByTestId("multi-selection-bounds")).toBeVisible();
  await expect(page.getByTestId("selection-size-badge")).toHaveText("288 x 116");
  await expect(page.getByTestId("resize-handle-top-left")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-bottom-right")).toHaveCount(0);
});

test("Figma-like measurement overlay and inspector alignment controls selected layers", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  const rectangleLayer = page.getByRole("button", { name: "사각형 3" });
  await expect(rectangleLayer).toBeVisible();

  await page.getByTestId("inspector-x").fill("620");
  await page.getByTestId("inspector-y").fill("130");
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");

  await headlineLayer.click();
  await page.getByRole("button", { name: "검사기 오른쪽 맞춤" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("160");

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 640, stageBox.y + 150);
  await expect(page.getByTestId("measurement-overlay")).toBeVisible();
  await expect(page.getByTestId("measurement-size-label")).toHaveText("160 x 96");
  await expect(page.getByTestId("measurement-distance-horizontal")).toContainText("80");
});

test("selected layers expose four corner resize handles and an immediate size badge", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();

  await expect(page.getByTestId("selection-size-badge")).toHaveText("260 x 48");
  await expect(page.getByTestId("resize-handle-top-left")).toBeVisible();
  await expect(page.getByTestId("resize-handle-top-right")).toBeVisible();
  await expect(page.getByTestId("resize-handle-bottom-left")).toBeVisible();
  await expect(page.getByTestId("resize-handle-bottom-right")).toBeVisible();

  const topLeftHandleBox = await page.getByTestId("resize-handle-top-left").boundingBox();
  if (!topLeftHandleBox) {
    throw new Error("top-left resize handle was not visible");
  }

  const handleCenter = {
    x: topLeftHandleBox.x + topLeftHandleBox.width / 2,
    y: topLeftHandleBox.y + topLeftHandleBox.height / 2
  };

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  await page.mouse.move(handleCenter.x - 20, handleCenter.y - 20);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-x")).toHaveValue("12");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("280");
  await expect(page.getByTestId("inspector-height")).toHaveValue("68");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("280 x 68");
});

test("resize handles expose directional mouse cursors while hovered", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "헤드라인" }).click();

  const stageCursor = () =>
    page.evaluate(() => {
      const stageContainer = document.querySelector<HTMLElement>(".konvajs-content");
      if (!stageContainer) {
        throw new Error("Konva stage container was not visible");
      }
      return window.getComputedStyle(stageContainer).cursor;
    });

  for (const [handle, cursor] of [
    ["top-left", "nwse-resize"],
    ["bottom-right", "nwse-resize"],
    ["top-right", "nesw-resize"],
    ["bottom-left", "nesw-resize"]
  ] as const) {
    const handleBox = await page.getByTestId(`resize-handle-${handle}`).boundingBox();
    if (!handleBox) {
      throw new Error(`${handle} resize handle was not visible`);
    }

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await expect.poll(stageCursor).toBe(cursor);
  }

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }
  await page.mouse.move(stageBox.x + 20, stageBox.y + 20);
  await expect.poll(stageCursor).toBe("auto");
});

test("selected layers expose only corner resize handles and side drags do not resize", async ({ page }) => {
  await createProjectFromEmptyState(page);

  const headlineLayer = page.getByRole("button", { name: "헤드라인" });
  await headlineLayer.click();

  await expect(page.getByTestId("resize-handle-top")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-right")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-bottom")).toHaveCount(0);
  await expect(page.getByTestId("resize-handle-left")).toHaveCount(0);

  const topRightHandleBox = await page.getByTestId("resize-handle-top-right").boundingBox();
  const bottomRightHandleBox = await page.getByTestId("resize-handle-bottom-right").boundingBox();
  if (!topRightHandleBox || !bottomRightHandleBox) {
    throw new Error("corner resize handles were not visible");
  }

  const rightEdgeMidpoint = {
    x: topRightHandleBox.x + topRightHandleBox.width / 2,
    y:
      (topRightHandleBox.y +
        topRightHandleBox.height / 2 +
        bottomRightHandleBox.y +
        bottomRightHandleBox.height / 2) /
      2
  };

  await page.mouse.move(rightEdgeMidpoint.x, rightEdgeMidpoint.y);
  await page.mouse.down();
  await page.mouse.move(rightEdgeMidpoint.x + 30, rightEdgeMidpoint.y);
  await page.mouse.up();

  await headlineLayer.click();
  await expect(page.getByTestId("inspector-width")).toHaveValue("260");
  await expect(page.getByTestId("inspector-height")).toHaveValue("48");
  await expect(page.getByTestId("selection-size-badge")).toHaveText("260 x 48");
});

test("selected frames show thin padding and child spacing guides", async ({ page }) => {
  await createProjectFromEmptyState(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByRole("button", { name: "랜딩 프레임" }).click();

  await expect(page.getByTestId("frame-spacing-overlay")).toBeVisible();
  await expect(page.getByTestId("frame-padding-left")).toHaveText("32");
  await expect(page.getByTestId("frame-padding-top")).toHaveText("40");
  await expect(page.getByTestId("frame-padding-right")).toHaveText("80");
  await expect(page.getByTestId("frame-padding-bottom")).toHaveText("44");
  await expect(page.getByTestId("frame-spacing-vertical")).toHaveText("52");
});

test("component instances drag as a single selected object from nested content", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "컴포넌트 만들기" }).click();
  await page.getByRole("button", { name: "인스턴스 만들기" }).click();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");
  await expect(page.getByTestId("inspector-x")).toHaveValue("560");
  await expect(page.getByTestId("inspector-y")).toHaveValue("120");

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.move(stageBox.x + 612, stageBox.y + 178);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 672, stageBox.y + 208);
  await page.mouse.up();

  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");
  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("150");
});

test("unselected component instances select first and move only after a selected drag", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "컴포넌트 만들기" }).click();
  await page.getByRole("button", { name: "인스턴스 만들기" }).click();
  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");

  const stageBox = await page.locator("canvas").first().boundingBox();
  if (!stageBox) {
    throw new Error("stage canvas was not visible");
  }

  await page.mouse.click(stageBox.x + 60, stageBox.y + 580);
  await expect(page.getByText("레이어 또는 캔버스 요소를 선택하세요.")).toBeVisible();

  await page.mouse.move(stageBox.x + 590, stageBox.y + 140);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 650, stageBox.y + 170);
  await page.mouse.up();

  await expect(page.locator(".node-summary span")).toHaveText("컴포넌트 인스턴스");
  await expect(page.getByTestId("inspector-x")).toHaveValue("560");
  await expect(page.getByTestId("inspector-y")).toHaveValue("120");

  await page.mouse.move(stageBox.x + 590, stageBox.y + 140);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 650, stageBox.y + 170);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-x")).toHaveValue("620");
  await expect(page.getByTestId("inspector-y")).toHaveValue("150");
});

test("inspector auto layout stacks children inside a selected frame", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("80");
});

test("inspector layout reverse direction places children from the main-axis end", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal_reverse");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("260");
  await page.getByTestId("inspector-height").fill("48");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("140");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("48");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-direction")).toHaveValue("horizontal_reverse");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical_reverse");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("212");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("170");
});

test("inspector auto layout uses fit sizing for container", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("120");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-width-sizing").selectOption("fit");
  await page.getByTestId("inspector-layout-height-sizing").selectOption("fit");
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-width-sizing")).toHaveValue("fit");
  await expect(page.getByTestId("inspector-layout-height-sizing")).toHaveValue("fit");
  await expect(page.getByTestId("inspector-width")).toHaveValue("168");
  await expect(page.getByTestId("inspector-height")).toHaveValue("122");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("72");
});

test("inspector grid layout auto-places static children into equal cells", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await expect(page.getByTestId("inspector-layout-grid-columns")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-grid-rows")).toBeVisible();
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("12");
  await page.getByTestId("inspector-layout-column-gap").fill("16");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await expect(page.locator(".node-summary strong")).toHaveText("랜딩 프레임");
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }
  await expect(page.getByRole("button", { name: "사각형 5" })).toBeVisible();

  const cellPositions: string[] = [];
  for (const name of ["헤드라인", "사각형 3", "사각형 4", "사각형 5"]) {
    await page.getByRole("button", { name }).click();
    cellPositions.push(`${await page.getByTestId("inspector-x").inputValue()},${await page.getByTestId("inspector-y").inputValue()}`);
  }
  expect(cellPositions.sort()).toEqual(["188,126", "188,20", "24,126", "24,20"]);
});

test("inspector grid track units resize cells with px and fr values", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("500");
  await page.getByTestId("inspector-height").fill("260");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toBeVisible();
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 2fr 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("80px 1fr");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }

  const positions: Record<string, string> = {};
  for (const name of ["헤드라인", "사각형 3", "사각형 4", "사각형 5"]) {
    await page.getByRole("button", { name }).click();
    positions[name] = `${await page.getByTestId("inspector-x").inputValue()},${await page.getByTestId("inspector-y").inputValue()}`;
  }

  expect(positions).toMatchObject({
    "헤드라인": "20,20",
    "사각형 3": "150,20",
    "사각형 4": "373.3,20",
    "사각형 5": "20,110"
  });
});

test("canvas grid column handles resize tracks directly in the viewport", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHandle = page.getByTestId("grid-column-resize-handle-1");
  await expect(firstColumnHandle).toBeVisible();
  const handleBox = await firstColumnHandle.boundingBox();
  if (!handleBox) {
    throw new Error("grid column handle did not expose a bounding box");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 40, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("160px 1fr");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("190");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstRowHandle = page.getByTestId("grid-row-resize-handle-1");
  await expect(firstRowHandle).toBeVisible();
  const rowHandleBox = await firstRowHandle.boundingBox();
  if (!rowHandleBox) {
    throw new Error("grid row handle did not expose a bounding box");
  }

  await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + rowHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + rowHandleBox.height / 2 + 30);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("120px 1fr");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("140");
});

test("canvas grid viewport add controls append rows and columns", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await expect(page.getByTestId("grid-column-add-control")).toBeVisible();
  await expect(page.getByTestId("grid-row-add-control")).toBeVisible();
  await page.getByTestId("grid-column-add-control").click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 1fr");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("grid-row-add-control").click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 1fr 1fr");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");
});

test("canvas grid viewport remove controls delete specific rows and columns", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 1fr 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await expect(page.getByTestId("grid-column-remove-control-3")).toBeVisible();
  await expect(page.getByTestId("grid-row-remove-control-3")).toBeVisible();
  await page.getByTestId("grid-column-remove-control-3").click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr");
  await expect(page.getByTestId("grid-column-remove-control-3")).toHaveCount(0);

  await page.getByTestId("grid-row-remove-control-3").click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 1fr");
  await expect(page.getByTestId("grid-row-remove-control-3")).toHaveCount(0);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");
});

test("canvas grid header context menu edits rows and columns", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 40px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByTestId("grid-column-header-2").click({ button: "right" });
  const menu = page.getByTestId("grid-track-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "왼쪽에 열 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "오른쪽에 열 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "열 복제" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "열 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "왼쪽에 열 추가" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 80px 1fr");

  await page.getByTestId("grid-column-header-3").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "열 복제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 80px 80px 1fr");

  await page.getByTestId("grid-column-header-4").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "열 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr 80px 1fr");

  await page.getByTestId("grid-row-header-2").click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "행 복제" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "위에 행 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "아래에 행 추가" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "행 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "행 복제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 40px 40px 1fr");

  await page.getByTestId("grid-row-header-3").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "행 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px 40px 1fr");
});

test("canvas grid header context menu deletes tracks with shapes", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }
  await expect(page.getByRole("button", { name: "사각형 6" })).toBeVisible();

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("grid-column-header-2").click({ button: "right" });
  const menu = page.getByTestId("grid-track-context-menu");
  await expect(menu.getByRole("menuitem", { name: "열과 객체 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "열과 객체 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("120px 1fr");
  await expect(page.getByRole("button", { name: "사각형 3" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "사각형 6" })).toHaveCount(0);

  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 5" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("grid-row-header-2").click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "행과 객체 삭제" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "행과 객체 삭제" }).click();
  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("90px");
  await expect(page.getByRole("button", { name: "사각형 5" })).toHaveCount(0);
});

test("canvas grid headers drag reorder rows and columns with shapes", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 40px 1fr");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHeader = page.getByTestId("grid-column-header-1");
  const thirdColumnHeader = page.getByTestId("grid-column-header-3");
  const firstColumnBox = await firstColumnHeader.boundingBox();
  const thirdColumnBox = await thirdColumnHeader.boundingBox();
  if (!firstColumnBox || !thirdColumnBox) {
    throw new Error("grid column headers did not expose bounding boxes");
  }
  await page.mouse.move(firstColumnBox.x + firstColumnBox.width / 2, firstColumnBox.y + firstColumnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdColumnBox.x + thirdColumnBox.width / 2, thirdColumnBox.y + thirdColumnBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("80px 1fr 120px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 5" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("110");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstRowHeader = page.getByTestId("grid-row-header-1");
  const thirdRowHeader = page.getByTestId("grid-row-header-3");
  const firstRowBox = await firstRowHeader.boundingBox();
  const thirdRowBox = await thirdRowHeader.boundingBox();
  if (!firstRowBox || !thirdRowBox) {
    throw new Error("grid row headers did not expose bounding boxes");
  }
  await page.mouse.move(firstRowBox.x + firstRowBox.width / 2, firstRowBox.y + firstRowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdRowBox.x + thirdRowBox.width / 2, thirdRowBox.y + thirdRowBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-row-tracks")).toHaveValue("40px 1fr 90px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("170");
  await page.getByRole("button", { name: "사각형 5" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("280");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("canvas grid Ctrl-drag reorder preserves object positions", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("button", { name: "랜딩 프레임" }).click();
    await page.getByRole("button", { name: "사각형 만들기" }).click();
    await page.getByTestId("inspector-width").fill("80");
    await page.getByTestId("inspector-height").fill("40");
  }

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("240");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHeader = page.getByTestId("grid-column-header-1");
  const thirdColumnHeader = page.getByTestId("grid-column-header-3");
  const firstColumnBox = await firstColumnHeader.boundingBox();
  const thirdColumnBox = await thirdColumnHeader.boundingBox();
  if (!firstColumnBox || !thirdColumnBox) {
    throw new Error("grid column headers did not expose bounding boxes");
  }
  await page.keyboard.down("Control");
  await page.mouse.move(firstColumnBox.x + firstColumnBox.width / 2, firstColumnBox.y + firstColumnBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdColumnBox.x + thirdColumnBox.width / 2, thirdColumnBox.y + thirdColumnBox.height / 2);
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("80px 1fr 120px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("240");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("canvas grid header reorder supports spanned grid items", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("160");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-grid-column").fill("1");
  await page.getByTestId("inspector-layout-item-grid-row").fill("1");
  await page.getByTestId("inspector-layout-item-grid-column-span").fill("2");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("210");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  const firstColumnHeader = page.getByTestId("grid-column-header-1");
  const thirdColumnHeader = page.getByTestId("grid-column-header-3");
  const firstColumnBox = await firstColumnHeader.boundingBox();
  const thirdColumnBox = await thirdColumnHeader.boundingBox();
  if (!firstColumnBox || !thirdColumnBox) {
    throw new Error("grid column headers did not expose bounding boxes");
  }
  await page.mouse.move(firstColumnBox.x + firstColumnBox.width / 2, firstColumnBox.y + firstColumnBox.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => document.body.style.cursor))
    .toBe("grabbing");

  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error("grid reorder test requires a fixed viewport");
  }
  await page.setViewportSize({ width: viewport.width - 1, height: viewport.height });
  await expect
    .poll(() => page.evaluate(() => document.body.style.cursor))
    .toBe("grabbing");

  const refreshedThirdColumnBox = await thirdColumnHeader.boundingBox();
  if (!refreshedThirdColumnBox) {
    throw new Error("grid column reorder target disappeared after drag start");
  }
  const targetPoint = {
    x: refreshedThirdColumnBox.x + refreshedThirdColumnBox.width / 2,
    y: refreshedThirdColumnBox.y + refreshedThirdColumnBox.height / 2
  };
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest<HTMLElement>('[data-grid-track-header="true"]')
            ?.dataset.gridTrackIndex,
        targetPoint
      )
    )
    .toBe("2");
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-grid-column-tracks")).toHaveValue("80px 1fr 120px");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-grid-column")).toHaveValue("1");
  await expect(page.getByTestId("inspector-layout-item-grid-column-span")).toHaveValue("3");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("380");
});

test("inspector manual grid cell placement moves a child to the requested cell", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("390");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("3");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("15");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("15");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-layout-item-grid-column")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-item-grid-row")).toBeVisible();
  await page.getByTestId("inspector-layout-item-grid-column").fill("3");
  await page.getByTestId("inspector-layout-item-grid-row").fill("2");
  await expect(page.getByTestId("inspector-x")).toHaveValue("263");
  await expect(page.getByTestId("inspector-y")).toHaveValue("115");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("15");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector grid justify items stretch expands child width", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("320");
  await page.getByTestId("inspector-height").fill("140");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("1");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-grid-justify-items").selectOption("stretch");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("10");
  await page.getByTestId("inspector-layout-padding-right").fill("10");
  await page.getByTestId("inspector-layout-padding-bottom").fill("10");
  await page.getByTestId("inspector-layout-padding-left").fill("10");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("40");
  await page.getByTestId("inspector-height").fill("40");

  await expect(page.getByTestId("inspector-x")).toHaveValue("10");
  await expect(page.getByTestId("inspector-y")).toHaveValue("10");
  await expect(page.getByTestId("inspector-width")).toHaveValue("150");
});

test("inspector grid item self alignment overrides container stretch", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("320");
  await page.getByTestId("inspector-height").fill("160");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("1");
  await page.getByTestId("inspector-layout-align-items").selectOption("stretch");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-grid-justify-items").selectOption("stretch");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("10");
  await page.getByTestId("inspector-layout-padding-right").fill("10");
  await page.getByTestId("inspector-layout-padding-bottom").fill("10");
  await page.getByTestId("inspector-layout-padding-left").fill("10");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-justify-self").selectOption("end");
  await page.getByTestId("inspector-layout-item-align-self").selectOption("center");
  await page.getByTestId("inspector-width").fill("40");
  await page.getByTestId("inspector-height").fill("40");

  await expect(page.getByTestId("inspector-layout-item-justify-self")).toHaveValue("end");
  await expect(page.getByTestId("inspector-layout-item-align-self")).toHaveValue("center");
  await expect(page.getByTestId("inspector-x")).toHaveValue("120");
  await expect(page.getByTestId("inspector-y")).toHaveValue("60");
  await expect(page.getByTestId("inspector-width")).toHaveValue("40");
  await expect(page.getByTestId("inspector-height")).toHaveValue("40");
});

test("inspector grid item baseline self alignment appears in dev handoff", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("1");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-align-self").selectOption("baseline");

  await expect(page.getByTestId("inspector-layout-item-align-self")).toHaveValue("baseline");
  await page.getByTestId("inspector-tab-dev").click();
  await expect(page.getByTestId("dev-panel-css")).toContainText("align-self: baseline;");
  await expect(page.getByTestId("dev-panel-structure")).toContainText('"align_self": "baseline"');
});

test("inspector grid baseline aligns mixed text per row", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "label-1",
          name: "라벨",
          value: "Label",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "subtitle-1",
          name: "서브타이틀",
          value: "Sub",
          x: 0,
          y: 0,
          width: 90,
          height: 48,
          fill: "#111827",
          fontSize: 32,
          fontFamily: "Inter"
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("300");
  await page.getByTestId("inspector-height").fill("180");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-columns").fill("2");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("baseline");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("20");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");
  await page.getByRole("button", { name: "캡션" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "라벨" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-mode")).toHaveValue("grid");
  await expect(page.getByTestId("inspector-layout-align-items")).toHaveValue("baseline");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "캡션" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("29");
  await page.getByRole("button", { name: "라벨" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("113");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("150");
  await expect(page.getByTestId("inspector-y")).toHaveValue("100");
});

test("inspector auto layout baseline aligns mixed text baselines", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("140");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-align-items").selectOption("baseline");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("10");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("120");
  await page.getByTestId("inspector-height").fill("48");
  await page.getByRole("button", { name: "캡션" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-align-items")).toHaveValue("baseline");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "캡션" }).click();
  await expect(page.getByTestId("inspector-y")).toHaveValue("29");
});

test("inspector wrapped auto layout baseline aligns each row", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
  const agentResponse = await page.request.post(`http://127.0.0.1:4317/files/${documentId}/agent/commands`, {
    data: {
      dryRun: false,
      commands: [
        {
          type: "create_text",
          parentId: "frame-1",
          id: "caption-1",
          name: "캡션",
          value: "Caption",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "label-1",
          name: "라벨",
          value: "Label",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          fill: "#374151",
          fontSize: 16,
          fontFamily: "Inter"
        },
        {
          type: "create_text",
          parentId: "frame-1",
          id: "subtitle-1",
          name: "서브타이틀",
          value: "Sub",
          x: 0,
          y: 0,
          width: 90,
          height: 48,
          fill: "#111827",
          fontSize: 32,
          fontFamily: "Inter"
        }
      ]
    }
  });
  expect(agentResponse.ok()).toBeTruthy();
  await page.reload();
  await openFilePanel(page);

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("240");
  await page.getByTestId("inspector-height").fill("180");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-wrap").selectOption("wrap");
  await page.getByTestId("inspector-layout-align-content").selectOption("start");
  await page.getByTestId("inspector-layout-align-items").selectOption("baseline");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");
  await page.getByRole("button", { name: "캡션" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "라벨" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("24");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("48");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-wrap")).toHaveValue("wrap");
  await expect(page.getByTestId("inspector-layout-align-items")).toHaveValue("baseline");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "캡션" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("120");
  await expect(page.getByTestId("inspector-y")).toHaveValue("29");
  await page.getByRole("button", { name: "라벨" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("93");
  await page.getByRole("button", { name: "서브타이틀" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("110");
  await expect(page.getByTestId("inspector-y")).toHaveValue("80");
});

test("inspector grid item span stretches a child across multiple cells", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("390");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("3");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("15");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("15");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-layout-item-grid-column-span")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-item-grid-row-span")).toBeVisible();
  await page.getByTestId("inspector-layout-item-grid-column").fill("1");
  await page.getByTestId("inspector-layout-item-grid-row").fill("1");
  await page.getByTestId("inspector-layout-item-grid-column-span").fill("2");
  await page.getByTestId("inspector-layout-item-grid-row-span").fill("2");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("15");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("236");
  await expect(page.getByTestId("inspector-height")).toHaveValue("180");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("263");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("canvas grid area boundary handle expands an explicit child span", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("8");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-grid-column").fill("1");
  await page.getByTestId("inspector-layout-item-grid-row").fill("1");
  await page.getByTestId("inspector-layout-item-grid-column-span").fill("1");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("120");

  const rightBoundaryHandle = page.getByTestId("grid-area-boundary-handle-right");
  await expect(rightBoundaryHandle).toBeVisible();
  const handleBox = await rightBoundaryHandle.boundingBox();
  if (!handleBox) {
    throw new Error("grid area right boundary handle did not expose a bounding box");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 90, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-item-grid-column")).toHaveValue("1");
  await expect(page.getByTestId("inspector-layout-item-grid-column-span")).toHaveValue("2");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("210");
});

test("canvas grid area boundary handle expands a named grid area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("280");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 120px");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("80px 80px");
  await page.getByTestId("inspector-layout-grid-areas").fill("hero:1/1/1/1");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-grid-area").fill("hero");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-layout-item-grid-area")).toHaveValue("hero");
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-height")).toHaveValue("80");

  const bottomBoundaryHandle = page.getByTestId("grid-area-boundary-handle-bottom");
  await expect(bottomBoundaryHandle).toBeVisible();
  const handleBox = await bottomBoundaryHandle.boundingBox();
  if (!handleBox) {
    throw new Error("grid area bottom boundary handle did not expose a bounding box");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 80);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-item-grid-area")).toHaveValue("hero");
  await expect(page.getByTestId("inspector-height")).toHaveValue("160");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("hero:1/1/1/2");
});

test("canvas grid empty cell context menu creates a named area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-column-gap").fill("10");
  await page.getByTestId("inspector-layout-row-gap").fill("8");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByTestId("grid-cell-hit-zone-2-1").click({ button: "right" });
  const menu = page.getByTestId("grid-cell-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("area1:2/1/1/1");
});

test("canvas grid multi-cell context menu creates a spanned named area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByTestId("grid-cell-hit-zone-1-1").click({ modifiers: ["ControlOrMeta"] });
  await page.getByTestId("grid-cell-hit-zone-3-2").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByTestId("grid-cell-selection-range")).toBeVisible();

  await page.getByTestId("grid-cell-hit-zone-2-1").click({ button: "right" });
  const menu = page.getByTestId("grid-cell-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "셀 병합 영역 만들기" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("area1:1/1/3/2");
});

test("canvas grid cell context menu splits an existing named area", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-grid-column-tracks").fill("120px 80px 1fr");
  await page.getByTestId("inspector-layout-grid-row-tracks").fill("90px 90px");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");
  await page.getByTestId("inspector-layout-grid-areas").fill("hero:1/1/3/2");
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("hero:1/1/3/2");

  await page.getByTestId("grid-cell-hit-zone-2-1").click({ button: "right" });
  const menu = page.getByTestId("grid-cell-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "병합 영역 분리" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "병합 영역 분리" }).click();
  await expect(page.getByTestId("inspector-layout-grid-areas")).toHaveValue("");
});

test("inspector grid named areas place children and reserve occupied cells", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("390");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("grid");
  await page.getByTestId("inspector-layout-grid-columns").fill("3");
  await page.getByTestId("inspector-layout-grid-rows").fill("2");
  await expect(page.getByTestId("inspector-layout-grid-areas")).toBeVisible();
  await page.getByTestId("inspector-layout-grid-areas").fill("hero:2/1/2/2");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("0");
  await page.getByTestId("inspector-layout-row-gap").fill("10");
  await page.getByTestId("inspector-layout-column-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("15");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("15");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-layout-item-grid-area")).toBeVisible();
  await page.getByTestId("inspector-layout-item-grid-area").fill("hero");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await expect(page.getByTestId("inspector-x")).toHaveValue("139");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await expect(page.getByTestId("inspector-width")).toHaveValue("236");
  await expect(page.getByTestId("inspector-height")).toHaveValue("180");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("40");
  await expect(page.getByTestId("inspector-x")).toHaveValue("15");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector layout item fill sizing stretches a child inside fixed auto layout", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("100");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-margin-right").fill("6");
  await page.getByTestId("inspector-layout-item-margin-left").fill("6");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("158");
  await expect(page.getByTestId("inspector-x")).toHaveValue("30");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("190");
});

test("direct resize pins fill layout child axes to fixed sizing", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("360");
  await page.getByTestId("inspector-height").fill("240");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("100");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByTestId("inspector-layout-item-margin-right").fill("6");
  await page.getByTestId("inspector-layout-item-margin-left").fill("6");
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await page.getByTestId("inspector-width").fill("80");
  await page.getByTestId("inspector-height").fill("30");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("158");

  const stageCanvasBox = await page.locator("canvas").first().boundingBox();
  if (!stageCanvasBox) {
    throw new Error("stage canvas was not visible");
  }
  const handlePoint = {
    x: stageCanvasBox.x + 450,
    y: stageCanvasBox.y + 258
  };

  await page.mouse.move(handlePoint.x, handlePoint.y);
  await page.mouse.down();
  await page.mouse.move(handlePoint.x + 32, handlePoint.y + 20);
  await page.mouse.up();

  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fixed");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fixed");
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-width").inputValue()))
    .toBeGreaterThan(300);
  await expect
    .poll(async () => Number(await page.getByTestId("inspector-height").inputValue()))
    .toBeGreaterThan(158);

  await page.keyboard.press("Control+Z");
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fill");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("158");

  await page.keyboard.press("Control+Shift+Z");
  await expect(page.getByTestId("inspector-layout-item-width-sizing")).toHaveValue("fixed");
  await expect(page.getByTestId("inspector-layout-item-height-sizing")).toHaveValue("fixed");
});

test("inspector layout min and max sizing clamps fit frames and fill children", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("420");
  await page.getByTestId("inspector-height").fill("280");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-width-sizing").selectOption("fit");
  await page.getByTestId("inspector-layout-height-sizing").selectOption("fit");
  await expect(page.getByTestId("inspector-layout-min-width")).toBeVisible();
  await expect(page.getByTestId("inspector-layout-max-width")).toBeVisible();
  await page.getByTestId("inspector-layout-min-width").fill("220");
  await page.getByTestId("inspector-layout-max-width").fill("240");
  await page.getByTestId("inspector-layout-min-height").fill("160");
  await page.getByTestId("inspector-layout-max-height").fill("170");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("24");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("24");
  await expect(page.getByTestId("inspector-width")).toHaveValue("240");
  await expect(page.getByTestId("inspector-height")).toHaveValue("160");

  await page.getByTestId("inspector-layout-width-sizing").selectOption("fixed");
  await page.getByTestId("inspector-layout-height-sizing").selectOption("fixed");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-max-width")).toBeVisible();
  await page.getByTestId("inspector-layout-item-width-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-height-sizing").selectOption("fill");
  await page.getByTestId("inspector-layout-item-max-width").fill("180");
  await page.getByTestId("inspector-layout-item-max-height").fill("110");
  await expect(page.getByTestId("inspector-width")).toHaveValue("180");
  await expect(page.getByTestId("inspector-height")).toHaveValue("110");
  await expect(page.getByTestId("inspector-x")).toHaveValue("24");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector layout item margin offsets auto-layout children", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-margin-top").fill("10");
  await page.getByTestId("inspector-layout-item-margin-right").fill("8");
  await page.getByTestId("inspector-layout-item-margin-bottom").fill("14");
  await page.getByTestId("inspector-layout-item-margin-left").fill("6");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("26");
  await expect(page.getByTestId("inspector-y")).toHaveValue("30");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("104");
});

test("inspector layout item position keeps absolute children out of auto-layout flow", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-layout-item-position").selectOption("absolute");
  await page.getByTestId("inspector-x").fill("140");
  await page.getByTestId("inspector-y").fill("160");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-layout-item-position")).toHaveValue("absolute");
  await expect(page.getByTestId("inspector-x")).toHaveValue("140");
  await expect(page.getByTestId("inspector-y")).toHaveValue("160");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
});

test("inspector auto layout wraps children into multiple rows", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("180");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-wrap").selectOption("wrap");
  await page.getByTestId("inspector-layout-align-content").selectOption("start");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("90");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("72");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("124");
});


test("inspector auto layout uses separate row and column gaps", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-width").fill("200");
  await page.getByTestId("inspector-height").fill("220");
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("horizontal");
  await page.getByTestId("inspector-layout-wrap").selectOption("wrap");
  await page.getByTestId("inspector-layout-align-content").selectOption("start");
  await page.getByTestId("inspector-layout-align-items").selectOption("start");
  await page.getByTestId("inspector-layout-justify-content").selectOption("start");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-row-gap").fill("24");
  await page.getByTestId("inspector-layout-column-gap").fill("6");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-width").fill("70");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("70");
  await page.getByTestId("inspector-height").fill("40");
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 4" })).toBeVisible();
  await page.getByTestId("inspector-width").fill("70");
  await page.getByTestId("inspector-height").fill("40");

  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await expect(page.getByTestId("inspector-layout-row-gap")).toHaveValue("24");
  await expect(page.getByTestId("inspector-layout-column-gap")).toHaveValue("6");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("96");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");
  await page.getByRole("button", { name: "사각형 4" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("20");
  await expect(page.getByTestId("inspector-y")).toHaveValue("84");
});

test("inspector auto layout alignment controls center and distribute children", async ({ page }) => {
  await createProjectFromEmptyState(page);
  await page.getByRole("button", { name: "랜딩 프레임" }).click();
  await page.getByTestId("inspector-layout-mode").selectOption("auto");
  await page.getByTestId("inspector-layout-direction").selectOption("vertical");
  await page.getByTestId("inspector-layout-align-items").selectOption("center");
  await page.getByTestId("inspector-layout-justify-content").selectOption("space_between");
  await page.getByTestId("inspector-layout-gap").fill("12");
  await page.getByTestId("inspector-layout-padding-top").fill("20");
  await page.getByTestId("inspector-layout-padding-right").fill("20");
  await page.getByTestId("inspector-layout-padding-bottom").fill("20");
  await page.getByTestId("inspector-layout-padding-left").fill("20");

  await page.getByRole("button", { name: "사각형 만들기" }).click();
  await expect(page.getByRole("button", { name: "사각형 3" })).toBeVisible();

  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("80");
  await expect(page.getByTestId("inspector-y")).toHaveValue("20");

  await page.getByRole("button", { name: "사각형 3" }).click();
  await expect(page.getByTestId("inspector-x")).toHaveValue("130");
  await expect(page.getByTestId("inspector-y")).toHaveValue("164");
});
