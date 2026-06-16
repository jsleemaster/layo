import { expect, test } from "@playwright/test";

test("canvas editor MVP supports select, inspect, edit, undo, create, and zoom", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  await page.getByRole("button", { name: "Headline" }).click();
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

  await page.mouse.move(stageBox.x + 400, stageBox.y + 160);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 470, stageBox.y + 220);
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
  await page.getByTestId("inspector-text").fill("Verified MVP headline");

  await expect(page.getByTestId("inspector-x")).toHaveValue("96");
  await expect(page.getByTestId("inspector-y")).toHaveValue("112");
  await expect(page.getByTestId("inspector-width")).toHaveValue("300");
  await expect(page.getByTestId("inspector-height")).toHaveValue("60");
  await expect(page.getByTestId("inspector-text")).toHaveValue("Verified MVP headline");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Canvas MCP Editor");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("inspector-text")).toHaveValue("Verified MVP headline");

  await page.getByRole("button", { name: "Create rectangle" }).click();
  await expect(page.getByRole("button", { name: "Rectangle 3" })).toBeVisible();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("125%")).toBeVisible();

  await page.screenshot({ path: "/tmp/canvas-mcp-editor-mvp-verified.png", fullPage: true });
});
