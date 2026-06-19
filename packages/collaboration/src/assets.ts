import { z } from "zod";

export interface TeamAssetMetadata {
  assetId: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  byteLength: number;
  hash: string;
}

const supportedMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const assetInputSchema = z.object({
  name: z.string().trim().min(1).default("Image"),
  mimeType: z.enum(supportedMimeTypes),
  byteLength: z.number().int().positive(),
  hash: z.string().trim().regex(/^sha256:[a-fA-F0-9]+$/)
});

export function createTeamAssetId(hash: string): string {
  return `asset-${hash.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function createTeamAssetMetadata(input: z.input<typeof assetInputSchema>): TeamAssetMetadata {
  const parsed = assetInputSchema.parse(input);
  return {
    ...parsed,
    hash: parsed.hash.toLowerCase(),
    assetId: createTeamAssetId(parsed.hash)
  };
}
