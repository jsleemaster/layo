import { describe, expect, test } from "vitest";
import { createDocumentRoomId } from "./room";

describe("collaboration room ids", () => {
  test("generates deterministic document room ids", () => {
    expect(createDocumentRoomId("team-1", "sample-file")).toBe(
      "layo:team-1:sample-file"
    );
  });

  test("rejects ids containing websocket path delimiters", () => {
    expect(() => createDocumentRoomId("team/1", "sample-file")).toThrow(/room id/i);
    expect(() => createDocumentRoomId("team-1", "../sample-file")).toThrow(/room id/i);
  });
});
