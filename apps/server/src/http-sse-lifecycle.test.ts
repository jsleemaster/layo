import { expect, test } from "vitest";
import { canWriteEventStream } from "./http";

test("an ended SSE response rejects late poll and heartbeat writes", () => {
  expect(canWriteEventStream({ destroyed: false, writableEnded: true })).toBe(false);
  expect(canWriteEventStream({ destroyed: true, writableEnded: false })).toBe(false);
  expect(canWriteEventStream({ destroyed: false, writableEnded: false })).toBe(true);
});
