import { describe, expect, test } from "vitest";
import { parseDocumentPayload } from "./document-api";

describe("parseDocumentPayload", () => {
  test("returns the file from the server payload", () => {
    const document = parseDocumentPayload({
      file: {
        id: "sample-file",
        name: "Sample File",
        pages: []
      }
    });

    expect(document.id).toBe("sample-file");
    expect(document.name).toBe("Sample File");
  });
});
