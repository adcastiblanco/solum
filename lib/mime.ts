// Tiny helper to derive the MIME type of an uploaded asset from its file
// name (or to confirm one the browser already set). Doc AI, OpenAI vision,
// and Anthropic vision all accept PDFs plus the common raster image formats
// — we route the same bytes through them with the matching content type.

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export const SUPPORTED_MIME_TYPES = Array.from(new Set(Object.values(EXT_TO_MIME)));

export function mimeFromFileName(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}
