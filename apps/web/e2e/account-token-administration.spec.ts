import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SERVER_ORIGIN = "http://127.0.0.1:4318";
const API_ORIGIN = "http://127.0.0.1:4319";
const WEB_ORIGIN = "http://127.0.0.1:5174";
const ACTIVE_SECRET = "active-browser-secret";
const SIBLING_SECRET = "sibling-automation-secret";
interface TrackedService {
  child: ChildProcess;
  output: string[];
}

const createdProcesses: TrackedService[] = [];
let fixtureRoot = "";
let authorizationFile = "";
let authorizationSidecarFile = "";
let baseAuthorizationText = "";
let proxyServer: Server | undefined;
let proxyFault: ProxyFault | undefined;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "layo-account-token-e2e-"));
  authorizationFile = join(fixtureRoot, "members.json");
  authorizationSidecarFile = `${authorizationFile}.tokens.json`;
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
  await waitForUrl(`${SERVER_ORIGIN}/health`, createdProcesses.at(-1));

  proxyServer = createFaultProxy();
  await new Promise<void>((resolve, reject) => {
    proxyServer!.once("error", reject);
    proxyServer!.listen(4319, "127.0.0.1", () => resolve());
  });
  await waitForUrl(`${API_ORIGIN}/health`);

  createdProcesses.push(
    startService(
      ["--dir", "apps/web", "exec", "vite", "--host", "127.0.0.1", "--port", "5174"],
      { VITE_API_BASE_URL: API_ORIGIN }
    )
  );
  await waitForUrl(WEB_ORIGIN, createdProcesses.at(-1));
});

test.afterAll(async () => {
  proxyFault?.release.resolve();
  proxyFault = undefined;
  if (proxyServer) {
    await new Promise<void>((resolve) => proxyServer!.close(() => resolve()));
    proxyServer = undefined;
  }
  await Promise.all(createdProcesses.reverse().map(stopService));
  if (fixtureRoot) {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test.beforeEach(async () => {
  await rm(authorizationSidecarFile, { force: true });
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

  const persistedBase = await readFile(authorizationFile, "utf8");
  expect(persistedBase).toBe(baseAuthorizationText);
  const persistedSidecar = await readFile(authorizationSidecarFile, "utf8");
  expect(persistedSidecar).toContain("tokenHash");
  expect(persistedSidecar).not.toMatch(/"token"\s*:/);
  expect(persistedSidecar).not.toContain(ACTIVE_SECRET);
  expect(persistedSidecar).not.toContain(SIBLING_SECRET);
  expect(persistedSidecar).not.toContain(createdSecret);

  await page.getByTestId("account-token-revoke-sibling-token").click();
  await expect(page.getByTestId("account-token-row-sibling-token")).toContainText("해지됨");
  const revokedAuthentication = await page.request.get(`${SERVER_ORIGIN}/account/tokens`, {
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

test("guards pending operations, network errors, and stale identity responses", async ({ page }) => {
  await createAuthenticatedLocalTeam(page);

  const delayedCreate = armProxyFault("POST", "/account/tokens", "delay");
  await page.getByTestId("account-token-name").fill("지연 생성");
  await page.getByTestId("account-token-create").click();
  await delayedCreate.seen.promise;
  await expect(page.getByTestId("account-token-create")).toBeDisabled();

  armProxyFault("GET", "/account/tokens", "status");
  delayedCreate.release.resolve();
  await expect(page.getByTestId("account-token-secret")).toBeVisible();
  await expect(page.getByTestId("account-token-status")).toContainText("토큰은 생성되었지만");

  armProxyFault("GET", "/account/tokens", "status");
  await page.getByTestId("account-token-refresh").click();
  await expect(page.getByTestId("account-token-status")).toContainText("계정 토큰 목록을 불러오지 못했습니다");

  const delayedRevoke = armProxyFault("DELETE", "/account/tokens/sibling-token", "delay");
  await page.getByTestId("account-token-revoke-sibling-token").click();
  await delayedRevoke.seen.promise;
  await expect(page.getByTestId("account-token-revoke-sibling-token")).toBeDisabled();
  delayedRevoke.release.resolve();
  await expect(page.getByTestId("account-token-row-sibling-token")).toContainText("해지됨");

  await page.getByRole("button", { name: "설정 내보내기" }).click();
  const manifest = page.getByTestId("team-manifest");
  const changedIdentity = JSON.parse(await manifest.inputValue()) as {
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

  const delayedRefresh = armProxyFault("GET", "/account/tokens", "delay");
  await page.getByTestId("account-token-refresh").click();
  await delayedRefresh.seen.promise;
  await manifest.fill(JSON.stringify(changedIdentity));
  await page.getByRole("button", { name: "설정 가져오기" }).click();
  await expect(page.getByTestId("account-token-member")).toContainText("review-user");
  delayedRefresh.release.resolve();
  await expect(page.getByTestId("account-token-status")).toContainText(
    "멤버 토큰을 적용하면 계정 토큰을 관리할 수 있습니다"
  );
  await expect(page.getByTestId("account-token-list")).toHaveCount(0);
});

test("drops a delayed create response after replacing an equal-identity collaboration session", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      configurable: true,
      value: () => "11111111-1111-4111-8111-111111111111"
    });
  });

  let collaborationSocketCount = 0;
  page.on("websocket", (socket) => {
    if (socket.url().includes("127.0.0.1:4329")) {
      collaborationSocketCount += 1;
    }
  });

  await page.goto(WEB_ORIGIN);
  await openFilePanel(page);
  const projectStatus = page.getByTestId("project-status");
  if ((await projectStatus.textContent())?.includes("저장된 프로젝트 없음")) {
    await page.getByRole("button", { name: "새 프로젝트 만들기" }).click();
    await expect(projectStatus).toContainText("새 프로젝트 저장됨");
  }

  await openTeamPanel(page);
  await page.getByRole("tab", { name: "실시간 협업" }).click();
  await page.getByTestId("team-name").fill("동일 세션 팀");
  await page.getByTestId("relay-url").fill("ws://127.0.0.1:4329");
  await page.getByTestId("member-token").fill(ACTIVE_SECRET);

  const createRelayTeamButton = page.getByRole("button", { name: "협업 팀 만들기" });
  await createRelayTeamButton.click();
  await expect(page.getByTestId("team-status")).toContainText("동일 세션 팀");
  await expect.poll(() => collaborationSocketCount).toBe(1);

  await page.getByTestId("team-name").fill("교체된 동일 세션 팀");
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "협업 팀 만들기"
    );
    const reactPropsKey = button && Object.keys(button).find((key) => key.startsWith("__reactProps$"));
    const reactProps = reactPropsKey
      ? (button as unknown as Record<string, { onClick?: () => void }>)[reactPropsKey]
      : undefined;
    if (!reactProps?.onClick) {
      throw new Error("협업 팀 만들기 핸들러를 찾지 못했습니다");
    }
    (window as Window & { recreateEqualIdentitySession?: () => void }).recreateEqualIdentitySession =
      reactProps.onClick;
  });

  await page.getByRole("tab", { name: "팀 설정" }).click();
  await expect(page.getByTestId("account-token-list")).toContainText("Current browser");

  const delayedCreate = armProxyFault("POST", "/account/tokens", "delay");
  const createResponse = page.waitForResponse(
    (response) => response.request().method() === "POST"
      && response.url() === `${API_ORIGIN}/account/tokens`
  );
  await page.getByTestId("account-token-name").fill("교체 전 지연 생성");
  await page.getByTestId("account-token-create").click();
  await delayedCreate.seen.promise;

  await page.evaluate(() => {
    const recreate = (window as Window & { recreateEqualIdentitySession?: () => void })
      .recreateEqualIdentitySession;
    if (!recreate) {
      throw new Error("동일 identity 세션 재생성 핸들러가 없습니다");
    }
    recreate();
  });
  await expect.poll(() => collaborationSocketCount).toBe(2);
  await expect(page.getByTestId("team-status")).toContainText("교체된 동일 세션 팀");
  await expect(page.getByTestId("account-token-member")).toContainText("local-user");

  delayedCreate.release.resolve();
  await createResponse;
  await expect(page.getByTestId("account-token-secret")).toHaveCount(0);
  await expect(page.getByTestId("account-token-status")).not.toContainText("교체 전 지연 생성");
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
  await expect(page.getByTestId("account-token-secret")).toHaveCount(0);
  expect(await page.locator("body").textContent()).not.toContain(reloadSecret);

  await page.getByTestId("team-name").fill("토큰 관리 팀");
  await page.getByRole("button", { name: "로컬 팀 만들기" }).click();
  await expect(page.getByTestId("team-status")).toContainText("토큰 관리 팀");
  await page.getByRole("tab", { name: "팀 설정" }).click();
  await expect(page.getByTestId("member-token")).toHaveValue("");
  await expect(page.getByTestId("account-token-create")).toHaveCount(0);

  const restoredCredentialInput = page.getByTestId("member-token");
  const applyCredentialButton = page.getByRole("button", { name: "멤버 토큰 적용" });
  await restoredCredentialInput.clear();
  await restoredCredentialInput.fill(ACTIVE_SECRET);
  await expect(restoredCredentialInput).toHaveValue(ACTIVE_SECRET);
  await expect(applyCredentialButton).toBeEnabled();
  await applyCredentialButton.click();
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

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

interface ProxyFault {
  method: string;
  path: string;
  mode: "delay" | "status";
  seen: Deferred;
  release: Deferred;
}

function createFaultProxy() {
  return createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      const requestPath = request.url ?? "/";
      const activeFault =
        proxyFault
        && proxyFault.method === request.method
        && proxyFault.path === requestPath
          ? proxyFault
          : undefined;
      if (activeFault) {
        proxyFault = undefined;
        activeFault.seen.resolve();
        if (activeFault.mode === "status") {
          response.writeHead(503, {
            "Access-Control-Allow-Origin": request.headers.origin ?? "*",
            "Content-Type": "application/json"
          });
          response.end(JSON.stringify({ error: "테스트 프록시 일시 실패" }));
          return;
        }
        await activeFault.release.promise;
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value !== undefined && name !== "host" && name !== "content-length") {
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
      }
      const upstream = await fetch(`${SERVER_ORIGIN}${requestPath}`, {
        method: request.method,
        headers,
        body: body.length > 0 ? body : undefined
      });
      response.statusCode = upstream.status;
      upstream.headers.forEach((value, name) => {
        if (!["content-encoding", "content-length", "transfer-encoding"].includes(name)) {
          response.setHeader(name, value);
        }
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : "테스트 프록시 전달 실패"
      }));
    }
  });
}

function armProxyFault(method: string, path: string, mode: ProxyFault["mode"]) {
  if (proxyFault) {
    throw new Error("only one account proxy fault may be armed at a time");
  }
  const fault = {
    method,
    path,
    mode,
    seen: deferred(),
    release: deferred()
  };
  proxyFault = fault;
  return fault;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function startService(args: string[], extraEnv: Record<string, string>): TrackedService {
  const child = spawn("pnpm", args, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const tracked = { child, output: [] as string[] };
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
        tracked.output.push(line);
        if (tracked.output.length > 80) tracked.output.shift();
      }
    });
  }
  return tracked;
}

async function stopService({ child }: TrackedService) {
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

async function waitForUrl(url: string, service?: TrackedService) {
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
  const diagnostics = service?.output.length ? `\n${service.output.join("\n")}` : "";
  throw new Error(`service did not become ready: ${url}${diagnostics}`);
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
  baseAuthorizationText = `${JSON.stringify([member], null, 2)}\n`;
  await writeFile(authorizationFile, baseAuthorizationText, {
    encoding: "utf8",
    mode: 0o600
  });
}
