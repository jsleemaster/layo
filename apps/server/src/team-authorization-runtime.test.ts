import { expect, test, vi } from "vitest";
import {
  createTeamAuthorizationRuntime,
  type TeamAuthorizationRuntimeDependencies
} from "./team-authorization-runtime";
import type {
  AuthenticatedTeamMember,
  TeamAuthorizationConfig,
  TeamAuthorizationProvider
} from "./team-authorization";
import type {
  TeamAuthorizationStateSnapshot,
  TeamAuthorizationStateStore
} from "./team-authorization-postgres";

const baseConfig: TeamAuthorizationConfig = {
  members: [
    {
      userId: "owner-user",
      role: "owner",
      teamIds: ["team-alpha"],
      token: "owner-token"
    }
  ]
};

const snapshot: TeamAuthorizationStateSnapshot = {
  generation: "1",
  baseFingerprint: "a".repeat(64),
  serializedState: '{"version":2,"members":[]}'
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function dependencies(overrides: Partial<TeamAuthorizationRuntimeDependencies> = {}) {
  const source = {
    config: baseConfig,
    close: vi.fn(),
    settled: vi.fn(async () => undefined)
  };
  const store = {
    read: vi.fn(async () => snapshot),
    initializeAbsent: vi.fn(),
    mutate: vi.fn(),
    close: vi.fn(async () => undefined)
  } as unknown as TeamAuthorizationStateStore;
  const provider: TeamAuthorizationProvider = {
    authenticate: vi.fn(async () => ({
      userId: "owner-user",
      role: "owner" as const,
      teamIds: ["team-alpha"]
    }))
  };
  const manager = {
    manageTokens: vi.fn(),
    listTokens: vi.fn(),
    createToken: vi.fn(),
    revokeToken: vi.fn(),
    listAuditEvents: vi.fn()
  };
  const values: TeamAuthorizationRuntimeDependencies = {
    watchConfigFile: vi.fn(async () => source),
    parseConfig: vi.fn(() => undefined),
    createStateStore: vi.fn(async () => store),
    createLocalProvider: vi.fn(() => provider),
    createSharedProvider: vi.fn(() => provider),
    createFileManager: vi.fn(() => manager),
    ...overrides
  };
  return { values, source, store, provider, manager };
}

test.each([
  {
    env: {
      LAYO_AUTHORIZATION_DATABASE_URL: "postgres://authorization"
    },
    missing: "LAYO_AUTHORIZATION_SHARED_SCOPE"
  },
  {
    env: {
      LAYO_AUTHORIZATION_SHARED_SCOPE: "team-alpha"
    },
    missing: "LAYO_AUTHORIZATION_DATABASE_URL"
  },
  {
    env: {
      LAYO_AUTHORIZATION_DATABASE_URL: "   ",
      LAYO_AUTHORIZATION_SHARED_SCOPE: "team-alpha"
    },
    missing: "LAYO_AUTHORIZATION_DATABASE_URL"
  },
  {
    env: {
      LAYO_AUTHORIZATION_DATABASE_URL: "postgres://authorization",
      LAYO_AUTHORIZATION_SHARED_SCOPE: "   "
    },
    missing: "LAYO_AUTHORIZATION_SHARED_SCOPE"
  }
])("rejects partial shared authorization configuration before opening resources", async ({ env, missing }) => {
  const fixture = dependencies();

  await expect(
    createTeamAuthorizationRuntime(env, fixture.values)
  ).rejects.toThrow(new RegExp(missing));

  expect(fixture.values.watchConfigFile).not.toHaveBeenCalled();
  expect(fixture.values.createStateStore).not.toHaveBeenCalled();
});

test("requires an operator members file for shared authorization", async () => {
  const fixture = dependencies();

  await expect(
    createTeamAuthorizationRuntime(
      {
        LAYO_AUTHORIZATION_DATABASE_URL: "postgres://authorization",
        LAYO_AUTHORIZATION_SHARED_SCOPE: "team-alpha"
      },
      fixture.values
    )
  ).rejects.toThrow(/LAYO_LIBRARY_REGISTRY_MEMBERS_FILE/);

  expect(fixture.values.watchConfigFile).not.toHaveBeenCalled();
  expect(fixture.values.createStateStore).not.toHaveBeenCalled();
});

test("shared startup validates the scope and cleans every opened resource on failure", async () => {
  const fixture = dependencies();
  vi.mocked(fixture.store.read).mockRejectedValueOnce(new Error("scope missing"));

  await expect(
    createTeamAuthorizationRuntime(
      {
        LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: "/run/layo/members.json",
        LAYO_AUTHORIZATION_DATABASE_URL: "postgres://authorization",
        LAYO_AUTHORIZATION_SHARED_SCOPE: "team-alpha"
      },
      fixture.values
    )
  ).rejects.toThrow(/scope missing/);

  expect(fixture.source.close).toHaveBeenCalledOnce();
  expect(fixture.source.settled).toHaveBeenCalledOnce();
  expect(fixture.store.close).toHaveBeenCalledOnce();
  expect(fixture.values.createSharedProvider).not.toHaveBeenCalled();
});

test("shared close rejects new work, drains in-flight authentication, and closes once", async () => {
  const auth = deferred<AuthenticatedTeamMember>();
  const fixture = dependencies({
    createSharedProvider: vi.fn(() => ({
      authenticate: vi.fn(() => auth.promise)
    }))
  });
  const runtime = await createTeamAuthorizationRuntime(
    {
      LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: "/run/layo/members.json",
      LAYO_AUTHORIZATION_DATABASE_URL: "postgres://authorization",
      LAYO_AUTHORIZATION_SHARED_SCOPE: "team-alpha"
    },
    fixture.values
  );

  expect(fixture.store.read).toHaveBeenCalledWith("team-alpha");
  const inFlight = runtime.authorizationProvider!.authenticate({
    userId: "owner-user",
    memberToken: "owner-token"
  });
  const firstClose = runtime.close();
  const secondClose = runtime.close();

  await expect(
    runtime.authorizationProvider!.authenticate({
      userId: "owner-user",
      memberToken: "owner-token"
    })
  ).rejects.toMatchObject({ statusCode: 503 });
  expect(fixture.store.close).not.toHaveBeenCalled();

  auth.resolve({
    userId: "owner-user",
    role: "owner",
    teamIds: ["team-alpha"]
  });
  await expect(inFlight).resolves.toMatchObject({ userId: "owner-user" });
  await Promise.all([firstClose, secondClose]);

  expect(fixture.source.close).toHaveBeenCalledOnce();
  expect(fixture.source.settled).toHaveBeenCalledOnce();
  expect(fixture.store.close).toHaveBeenCalledOnce();
  await runtime.settled();
  expect(fixture.store.close).toHaveBeenCalledOnce();
});

test("shared close rejects new work and drains an in-flight audit read", async () => {
  const audit = deferred<{ events: []; nextAfterId?: string }>();
  const fixture = dependencies();
  fixture.manager.listAuditEvents.mockReturnValue(audit.promise);
  const runtime = await createTeamAuthorizationRuntime(
    {
      LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: "/run/layo/members.json",
      LAYO_AUTHORIZATION_DATABASE_URL: "postgres://authorization",
      LAYO_AUTHORIZATION_SHARED_SCOPE: "team-alpha"
    },
    fixture.values
  );
  const manager = runtime.teamAuthorizationManager!;
  const principal = { userId: "owner-user", memberToken: "owner-token" };
  const inFlight = manager.listAuditEvents!(
    principal,
    { afterId: "0", limit: 50 }
  );
  const close = runtime.close();

  await expect(manager.listAuditEvents!(
    principal,
    { afterId: "0", limit: 50 }
  )).rejects.toMatchObject({ statusCode: 503 });
  expect(fixture.store.close).not.toHaveBeenCalled();

  audit.resolve({ events: [] });
  await expect(inFlight).resolves.toEqual({ events: [] });
  await close;
  expect(fixture.store.close).toHaveBeenCalledOnce();
});

test("shared close drains scheduled refreshes and ignores scheduling after close", async () => {
  const refresh = deferred<void>();
  const fixture = dependencies();
  let scheduleRefresh:
    | ((operation: () => Promise<void>) => void)
    | undefined;
  fixture.values.createFileManager = vi.fn((_filePath, _config, options) => {
    scheduleRefresh = options?.scheduleSharedRefresh;
    return fixture.manager;
  });
  const runtime = await createTeamAuthorizationRuntime(
    {
      LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: "/run/layo/members.json",
      LAYO_AUTHORIZATION_DATABASE_URL: "postgres://authorization",
      LAYO_AUTHORIZATION_SHARED_SCOPE: "team-alpha"
    },
    fixture.values
  );

  scheduleRefresh!(() => refresh.promise);
  const close = runtime.close();
  await Promise.resolve();
  expect(fixture.store.close).not.toHaveBeenCalled();

  refresh.resolve();
  await close;
  expect(fixture.store.close).toHaveBeenCalledOnce();

  const lateRefresh = vi.fn(async () => undefined);
  scheduleRefresh!(lateRefresh);
  await runtime.settled();
  expect(lateRefresh).not.toHaveBeenCalled();
});

test("local mode remains database-free and closes the watched source", async () => {
  const fixture = dependencies();
  const runtime = await createTeamAuthorizationRuntime(
    {
      LAYO_LIBRARY_REGISTRY_MEMBERS_FILE: "/run/layo/members.json"
    },
    fixture.values
  );

  expect(fixture.values.createStateStore).not.toHaveBeenCalled();
  expect(fixture.values.createLocalProvider).toHaveBeenCalledWith(baseConfig);
  expect(fixture.values.createFileManager).toHaveBeenCalled();
  await runtime.close();
  expect(fixture.source.close).toHaveBeenCalledOnce();
  expect(fixture.source.settled).toHaveBeenCalledOnce();
});
