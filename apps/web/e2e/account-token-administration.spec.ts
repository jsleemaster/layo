import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API_ORIGIN = "http://127.0.0.1:4318";
const WEB_ORIGIN = "http://127.0.0.1:5174";
const ACTIVE_SECRET = "active-browser-secret";
const SIBLING_SECRET = "sibling-automation-secret";
const createdProcesses: ChildProcess[] = [];
let fixtureRoot = "";
let authorizationFile = "";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "layo-account-token-e2e-"));
  authorizationFile = join(fixtureRoot, "members.json");
  await resetAuthorizationFile();

  createdProcesses.push(
    startService(
      ["--filter", "@layo/server", "exec", "tsx", "src/index.ts"],
      {
        HOST: "127.0.0.1",
        PORT: "4318",
        LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: authorizationFile,
        NODE_OPTIONS: "--conditions=development"
      }
    )
  );
  await waitForUrl(`${API_ORIGIN}/health`);

  createdProcesses.push(
    startService(
      ["--dir", "apps/web", "exec", "vite", "--host", "127.0.0.1", "--port", "5174"],
      { VITE_API_BASE_URL: API_ORIGIN }
    )
  );
  await waitForUrl(WEB_ORIGIN);
});

test.afterAll(async () => {
  await Promise.all(createdProcesses.reverse().map(stopService));
  if (fixtureRoot) {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test.beforeEach(async () => {
  await resetAuthorizationFile();
});

test("manages named account tokens over the isolated real network", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: WEB_ORIGIN });
  const accountRequests: Array<{ method: string; headers: Record<string, string> }> = [];
  const listBodies: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${API_ORIGIN}/account/tokens`)) {
      accountRequests.push({ method: request.method(), headers: request.headers() });
    }
  });
  page.on("response", async (response) => {
    if (response.request().method() === "GET" && response.url() === `${API_ORIGIN}/account/tokens`) {
      listBodies.push(await response.text());
    }
  });

  await createAuthenticatedLocalTeam(page);
  await expect(page.getByTestId("account-token-member")).toContainText("로컬 사용자");
  await expect(page.getByTestId("account-token-member")).toContainText("local-user");
  await expect(page.getByTestId("account-token-row-active-token")).toContainText("현재 토큰");
  await expect(page.getByTestId("account-token-row-sibling-token")).toContainText("Deploy automation");

  const expiry = page.getByTestId("account-token-expiry");
  await expect(expiry.locator("option")).toHaveText([
    "만료 없음",
    "30일",
    "60일",
    "90일",
    "180일"
  ]);
  await page.getByTestId("account-token-name").fill("브라우저 QA");
  await expiry.selectOption("60");
  await page.getByTestId("account-token-create").click();

  const secretField = page.getByTestId("account-token-secret");
  await expect(secretField).toBeVisible();
  const createdSecret = await secretField.inputValue();
  expect(createdSecret).toMatch(/^layo_pat_/);
  await page.getByTestId("account-token-copy").click();
  await expect(page.getByTestId("account-token-secret-status")).toContainText("복사됨");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(createdSecret);

  await page.getByTestId("account-token-refresh").click();
  await expect(page.getByTestId("account-token-list")).toContainText("브라우저 QA");
  expect(listBodies.join("\n")).not.toContain(createdSecret);
  expect(listBodies.join("\n")).not.toContain(ACTIVE_SECRET);
  expect(listBodies.join("\n")).not.toContain(SIBLING_SECRET);

  const persistedText = await readFile(authorizationFile, "utf8");
  expect(persistedText).toContain("tokenHash");
  expect(persistedText).not.toContain(ACTIVE_SECRET);
  expect(persistedText).not.toContain(SIBLING_SECRET);
  expect(persistedText).not.toContain(createdSecret);

  await page.getByTestId("account-token-revoke-sibling-token").click();
  await expect(page.getByTestId("account-token-row-sibling-token")).toContainText("해지됨");
  const revokedAuthentication = await page.request.get(`${API_ORIGIN}/account/tokens`, {
    headers: {
      Authorization: `Bearer ${SIBLING_SECRET}`,
      "X-Layo-User-Id": "local-user"
    }
  });
  expect(revokedAuthentication.status()).toBe(401);

  const accountRequest = accountRequests.find((request) => request.method === "POST");
  expect(accountRequest?.headers.authorization).toBe(`Bearer ${ACTIVE_SECRET}`);
  expect(accountRequest?.headers["x-layo-user-id"]).toBe("local-user");

  await page.getByTestId("account-token-revoke-active-token").click();
  await expect(page.getByTestId("account-token-self-revoke-confirmation")).toBeVisible();
  await page.getByLabel("현재 토큰 해지 확인").check();
  await page.getByRole("button", { name: "현재 토큰 해지" }).click();

  await expect(page.getByTestId("account-token-recovery")).toContainText("새 멤버 토큰을 입력");
  await expect(page.getByTestId("member-token")).toHaveValue("");
  await expect(page.getByTestId("team-status")).toContainText("토큰 관리 팀");
  await expect(page.getByTestId("team-status")).not.toContainText("팀 없음");
});

test("keeps one-time plaintext transient across every browser lifecycle boundary", async ({ page }) => {
  await createAuthenticatedLocalTeam(page);

  const firstSecret = await createToken(page, "첫 번째 비밀");
  await page.getByTestId("account-token-dismiss").click();
  await expect(page.getByTestId("account-token-secret")).toHaveCount(0);

  const secondSecret = await createToken(page, "두 번째 비밀");
  const thirdSecret = await createToken(page, "세 번째 비밀");
  expect(thirdSecret).not.toBe(secondSecret);
  await expect(page.getByTestId("account-token-secret")).toHaveValue(thirdSecret);
  expect(await page.getByTestId("account-token-panel").textContent()).not.toContain(secondSecret);

  await page.getByRole("tab", { name: "로컬 작업" }).click();
  await expect(page.getByTestId("account-token-secret")).toHaveCount(0);
  await page.getByRole("tab", { name: "팀 설정" }).click();

  const reloadSecret = await createToken(page, "새로고침 비밀");
  await page.reload();
  await openTeamPanel(page);
  await page.getByRole("tab", { name: "팀 설정" }).click();
  await expect(page.getByTestId("account-token-secret")).toHaveCount(0);

  await page.getByTestId("member-token").fill(ACTIVE_SECRET);
  await page.getByRole("button", { name: "멤버 토큰 적용" }).click();
  await expect(page.getByTestId("account-token-list")).toContainText("Current browser");
  const identitySecret = await createToken(page, "계정 변경 비밀");

  await page.getByRole("button", { name: "설정 내보내기" }).click();
  const manifestField = page.getByTestId("team-manifest");
  const exportedText = await manifestField.inputValue();
  expect(exportedText).not.toContain(firstSecret);
  expect(exportedText).not.toContain(secondSecret);
  expect(exportedText).not.toContain(thirdSecret);
  expect(exportedText).not.toContain(reloadSecret);
  expect(exportedText).not.toContain(identitySecret);

  const changedIdentity = JSON.parse(exportedText) as {
    currentUserId: string;
    members: Array<Record<string, unknown>>;
  };
  changedIdentity.currentUserId = "review-user";
  changedIdentity.members.push({
    userId: "review-user",
    displayName: "검토 사용자",
    color: "#0f9f8f",
    role: "editor"
  });
  await manifestField.fill(JSON.stringify(changedIdentity));
  await page.getByRole("button", { name: "설정 가져오기" }).click();
  await expect(page.getByTestId("account-token-secret")).toHaveCount(0);
  await expect(page.getByTestId("account-token-member")).toContainText("review-user");

  const storageDump = await readBrowserStorage(page);
  for (const secret of [firstSecret, secondSecret, thirdSecret, reloadSecret, identitySecret]) {
    expect(storageDump).not.toContain(secret);
  }
});

async function createAuthenticatedLocalTeam(page: Page) {
  await page.goto(WEB_ORIGIN);
  await openFilePanel(page);
  const emptyStatus = page.getByTestId("project-status");
  if ((await emptyStatus.textContent())?.includes("저장된 프로젝트 없음")) {
    await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
    await expect(emptyStatus).toContainText("새 프로젝트 저장됨");
  }

  await openTeamPanel(page);
  await page.getByTestId("team-name").fill("토큰 관리 팀");
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("토큰 관리 팀");
  await page.getByRole("tab", { name: "팀 설정" }).click();
  await page.getByTestId("member-token").fill(ACTIVE_SECRET);
  await page.getByRole("button", { name: "멤버 토큰 적용" }).click();
  await expect(page.getByTestId("account-token-list")).toContainText("Current browser");
}

async function createToken(page: Page, name: string) {
  await page.getByTestId("account-token-name").fill(name);
  await page.getByTestId("account-token-expiry").selectOption("");
  await page.getByTestId("account-token-create").click();
  const field = page.getByTestId("account-token-secret");
  await expect(field).toBeVisible();
  return field.inputValue();
}

async function openFilePanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "파일", exact: true }).click();
  await expect(page.getByTestId("project-status")).toBeVisible();
}

async function openTeamPanel(page: Page) {
  await page.getByTestId("editor-rail").getByRole("button", { name: "팀", exact: true }).click();
  await expect(page.getByTestId("team-name")).toBeVisible();
}

async function readBrowserStorage(page: Page) {
  return page.evaluate(async () => {
    const values: unknown[] = [Object.fromEntries(Object.entries(localStorage))];
    const databases = await indexedDB.databases();
    for (const database of databases) {
      if (!database.name) continue;
      const opened = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const storeName of Array.from(opened.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((resolve, reject) => {
          const transaction = opened.transaction(storeName, "readonly");
          const request = transaction.objectStore(storeName).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        values.push(rows);
      }
      opened.close();
    }
    return JSON.stringify(values);
  });
}

function startService(args: string[], extraEnv: Record<string, string>) {
  return spawn("pnpm", args, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function stopService(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000))
  ]);
}

async function waitForUrl(url: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`service did not become ready: ${url}`);
}

async function resetAuthorizationFile() {
  const member = {
    userId: "local-user",
    role: "owner",
    teamIds: ["team-alpha"],
    tokens: [
      {
        id: "active-token",
        name: "Current browser",
        tokenHash: createHash("sha256").update(ACTIVE_SECRET).digest("hex"),
        createdAt: "2026-07-13T12:00:00.000Z"
      },
      {
        id: "sibling-token",
        name: "Deploy automation",
        tokenHash: createHash("sha256").update(SIBLING_SECRET).digest("hex"),
        createdAt: "2026-07-12T12:00:00.000Z"
      }
    ]
  };
  await writeFile(authorizationFile, `${JSON.stringify([member], null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}
