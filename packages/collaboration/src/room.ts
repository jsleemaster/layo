const ROOM_PREFIX = "layo";
const SAFE_ROOM_PART = /^[a-zA-Z0-9_-]+$/;

export function createDocumentRoomId(teamId: string, documentId: string): string {
  assertSafeRoomPart(teamId);
  assertSafeRoomPart(documentId);
  return `${ROOM_PREFIX}:${teamId}:${documentId}`;
}

function assertSafeRoomPart(value: string) {
  if (!SAFE_ROOM_PART.test(value)) {
    throw new Error(`invalid room id part: ${value}`);
  }
}
