import { Mistral } from "@mistralai/mistralai";

const MODEL = "mistral-ocr-2505";

export class MistralExtractionError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "transport" | "schema" | "unknown",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MistralExtractionError";
  }
}

function client() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new MistralExtractionError(
      "MISTRAL_API_KEY is not configured",
      "transport",
    );
  }
  return new Mistral({ apiKey });
}

export type OcrPage = {
  index: number;
  markdown: string;
  width: number;
  height: number;
};

export type OcrResult = {
  pages: OcrPage[];
  /** Concatenated markdown across all pages, separated by page breaks. */
  fullMarkdown: string;
  /** Raw Mistral response, persisted for audit/debug. */
  raw: unknown;
};

// Layer 1 of the extraction pipeline: pure OCR.
// Returns the markdown of every page. Categorization into the Service Request
// Form schema happens in lib/anthropic.ts.
export async function ocrDocument(signedUrl: string): Promise<OcrResult> {
  const mistral = client();

  let response;
  try {
    response = await mistral.ocr.process({
      model: MODEL,
      document: { type: "document_url", documentUrl: signedUrl },
      includeImageBase64: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
      throw new MistralExtractionError("Mistral OCR timed out", "timeout", err);
    }
    if (/unsupported|invalid|cannot/i.test(message)) {
      throw new MistralExtractionError(
        `Unsupported document: ${message}`,
        "schema",
        err,
      );
    }
    throw new MistralExtractionError(
      `Mistral OCR failed: ${message}`,
      "transport",
      err,
    );
  }

  const rawPages = (response as { pages?: unknown[] }).pages ?? [];
  const pages: OcrPage[] = rawPages.map((p, i) => {
    const page = p as {
      index?: number;
      markdown?: string;
      dimensions?: { width?: number; height?: number };
    };
    return {
      index: typeof page.index === "number" ? page.index : i,
      markdown: typeof page.markdown === "string" ? page.markdown : "",
      width: page.dimensions?.width ?? 0,
      height: page.dimensions?.height ?? 0,
    };
  });

  const fullMarkdown = pages
    .map((p) => `--- Page ${p.index + 1} ---\n${p.markdown}`)
    .join("\n\n");

  return { pages, fullMarkdown, raw: response };
}
