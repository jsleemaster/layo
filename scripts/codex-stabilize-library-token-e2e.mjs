import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/e2e/editor-mvp.spec.ts";
const before = `  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  await expect(page.getByTestId("library-registry-token-updates")).toContainText("Team Kit 토큰 업데이트 가능");`;
const after = `  await page.getByRole("button", { name: "게시 목록 갱신" }).click();
  await expect(page.getByTestId("library-registry-status")).toContainText("게시 라이브러리 1개");
  await expect(page.getByTestId("library-registry-token-updates")).toContainText("Team Kit 토큰 업데이트 가능");`;

const source = readFileSync(path, "utf8");
if (source.includes(after)) {
  console.log("editor-mvp token update wait already patched");
  process.exit(0);
}
if (!source.includes(before)) {
  throw new Error("Could not find library token update e2e wait insertion point");
}
writeFileSync(path, source.replace(before, after));
console.log("patched editor-mvp library token update wait");
