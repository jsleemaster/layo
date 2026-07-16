import { expect, test, vi } from "vitest";
import { runAuthorizationAuditCli } from "./team-authorization-audit-cli.js";
import type { TeamAuthorizationStateStore } from "./team-authorization-postgres.js";

test("preserves the audit command failure when store close also fails", async () => {
  const commandError = new Error("injected export failure");
  const closeError = new Error("injected close failure");
  const store = {
    read: vi.fn(),
    initializeAbsent: vi.fn(),
    mutate: vi.fn(),
    listUnarchivedAuditEvents: vi.fn(async () => {
      throw commandError;
    }),
    markAuditEventsArchived: vi.fn(),
    listArchivedAuditRetentionCandidates: vi.fn(),
    deleteArchivedAuditEvents: vi.fn(),
    close: vi.fn(async () => {
      throw closeError;
    })
  } as unknown as TeamAuthorizationStateStore;

  await expect(runAuthorizationAuditCli(
    ["export", "--scope", "team-a", "--output", "/tmp/audit.json"],
    {
      env: {
        LAYO_AUTHORIZATION_DATABASE_URL: "postgres://unused"
      },
      createStore: async () => store
    }
  )).rejects.toBe(commandError);
  expect(commandError.cause).toBe(closeError);
});
