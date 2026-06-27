import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile, rm } from "node:fs/promises";

test.beforeEach(async () => {
  await rm(".layo", { recursive: true, force: true });
  await rm("apps/server/.layo", { recursive: true, force: true });
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
  fillColor = "#2563eb"
) {
  return page.evaluateHandle(async ({ fileName, imageSize, color }) => {
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
    const file = new File([blob], fileName, { type: "image/png" });
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

function pngDimensions(png: Buffer) {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
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
  await rm(".layo/projects", { recursive: true, force: true });
  await rm(".layo/files", { recursive: true, force: true });
  await rm("apps/server/.layo/projects", { recursive: true, force: true });
  await rm("apps/server/.layo/files", { recursive: true, force: true });

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

  const fittedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(fittedResponse.ok()).toBeTruthy();
  const fittedPayload = await fittedResponse.json();
  const fittedImage = fittedPayload.file.pages[0].children.find((node: { id: string }) => node.id === "image-3");
  expect(fittedImage.content.fit_mode).toBe("fit");

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

  const filledResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
  expect(filledResponse.ok()).toBeTruthy();
  const filledPayload = await filledResponse.json();
  const filledImage = filledPayload.file.pages[0].children.find((node: { id: string }) => node.id === "image-3");
  expect(filledImage.content.fit_mode).toBe("fill");
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

test("file version history previews saved version differences before restore", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);

  await page.getByTestId("file-version-message").fill("검토 전");
  await page.getByRole("button", { name: "현재 버전 저장" }).click();
  await expect(page.getByTestId("file-version-list")).toContainText("검토 전");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("inspector-text").fill("변경된 헤드라인");
  await expect(page.getByTestId("inspector-text")).toHaveValue("변경된 헤드라인");

  await expect
    .poll(async () => {
      const changedResponse = await page.request.get(`http://127.0.0.1:4317/files/${documentId}`);
      if (!changedResponse.ok()) {
        return "request failed";
      }
      return (await changedResponse.json()).file.pages[0].children[0].children[0].content.value;
    })
    .toBe("변경된 헤드라인");

  await page.getByRole("button", { name: "검토 전 미리보기" }).click();
  const preview = page.getByTestId("file-version-preview");
  await expect(preview).toContainText("검토 전");
  await expect(preview).toContainText("현재 파일과 비교");
  await expect(preview).toContainText("변경 1");
  await expect(preview).toContainText("text-1");

  await page.getByRole("button", { name: "미리보기 닫기" }).click();
  await expect(preview).toBeHidden();

  await page.getByRole("button", { name: "검토 전 미리보기" }).click();
  await page.getByRole("button", { name: "이 버전 복원" }).click();
  await expect(page.getByTestId("file-version-status")).toContainText("검토 전 복원됨");
  await page.getByRole("button", { name: "헤드라인" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Layo");
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

test("comments panel resolves current team members as mention targets", async ({ page }) => {
  const { documentId } = await createProjectFromEmptyState(page);
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
  await page.getByRole("button", { name: "현재 팀과 공유" }).click();
  await expect(page.getByTestId("project-sharing-status")).toContainText("민지 팀");

  await page.getByRole("button", { name: "헤드라인" }).click();
  await page.getByTestId("comment-body").fill("@민지 팀 멘션 확인");
  await page.getByRole("button", { name: "코멘트 추가" }).click();
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
      __layoCommentEventCount?: number;
      __layoEventSourceUrls?: string[];
      __layoSuppressedCommentPolling?: boolean;
    };
    const NativeEventSource = window.EventSource;
    const nativeSetInterval = window.setInterval.bind(window);

    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 2_000) {
        instrumentedWindow.__layoSuppressedCommentPolling = true;
        return 0;
      }
      return nativeSetInterval(handler, timeout, ...args);
    }) as typeof window.setInterval;

    class InstrumentedEventSource extends NativeEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);
        instrumentedWindow.__layoEventSourceUrls = [
          ...(instrumentedWindow.__layoEventSourceUrls ?? []),
          String(url)
        ];
        this.addEventListener("comment", () => {
          instrumentedWindow.__layoCommentEventCount =
            (instrumentedWindow.__layoCommentEventCount ?? 0) + 1;
        });
      }
    }

    window.EventSource = InstrumentedEventSource;
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
        __layoEventSourceUrls?: string[];
        __layoSuppressedCommentPolling?: boolean;
      };
      return (
        instrumentedWindow.__layoSuppressedCommentPolling === true &&
        (instrumentedWindow.__layoEventSourceUrls ?? []).some((url) => {
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

  await page.waitForFunction(() => {
    const instrumentedWindow = window as Window & { __layoCommentEventCount?: number };
    return (instrumentedWindow.__layoCommentEventCount ?? 0) > 0;
  });
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
  await page.mouse.move(thirdColumnBox.x + thirdColumnBox.width / 2, thirdColumnBox.y + thirdColumnBox.height / 2);
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
