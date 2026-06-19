const API_BASE_URL = "http://127.0.0.1:4317";

export interface UploadedAsset {
  assetId: string;
  name: string;
  mimeType: string;
  byteLength: number;
  url: string;
}

export async function uploadImageAsset(
  file: File,
  fetcher: typeof fetch = fetch
): Promise<UploadedAsset> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 가져올 수 있습니다");
  }

  const dataBase64 = await readFileAsBase64(file);
  const response = await fetcher(`${API_BASE_URL}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name || "이미지",
      mimeType: file.type,
      dataBase64
    })
  });

  if (!response.ok) {
    throw new Error(`이미지 저장 실패: ${response.status} ${response.statusText}`.trim());
  }

  const payload = (await response.json()) as { asset: UploadedAsset };
  return payload.asset;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const separatorIndex = result.indexOf(",");
      resolve(separatorIndex === -1 ? result : result.slice(separatorIndex + 1));
    };
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다"));
    reader.readAsDataURL(file);
  });
}
