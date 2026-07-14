import { describe, expect, test } from "vitest";
import { isCurrentAccountTokenOperation } from "./account-token-operation";

describe("account token operation freshness", () => {
  test("rejects a replaced session when generation and identity remain equal", () => {
    const originalSession = {};
    const replacementSession = {};
    const operation = {
      generation: 4,
      identity: "manifest:team-alpha:local-user:active-token",
      session: originalSession
    };

    expect(isCurrentAccountTokenOperation(operation, {
      ...operation,
      session: replacementSession
    })).toBe(false);
    expect(isCurrentAccountTokenOperation(operation, operation)).toBe(true);
  });
});
