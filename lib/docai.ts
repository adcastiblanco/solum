import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

export class DocAIError extends Error {
  constructor(
    message: string,
    readonly kind: "transport" | "auth" | "schema" | "unknown",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DocAIError";
  }
}

export type DocAiToken = {
  text: string;
  /** Normalized 0-1 bbox of this token on its page. */
  bbox: {
    page: number; // 1-indexed
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number | null;
};

export type DocAiPage = {
  index: number; // 1-indexed
  text: string;
  /** Page dimensions in pixels (from Doc AI). */
  width: number;
  height: number;
  tokens: DocAiToken[];
};

export type DocAiResult = {
  pages: DocAiPage[];
  /** Full document text concatenated, ready to feed to the categorizer. */
  fullMarkdown: string;
  /** Raw response (without bytes) for audit. */
  raw: unknown;
};

let cachedClient: DocumentProcessorServiceClient | null = null;
function client(): DocumentProcessorServiceClient {
  if (cachedClient) return cachedClient;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) {
    throw new DocAIError(
      "GOOGLE_APPLICATION_CREDENTIALS is not configured",
      "auth",
    );
  }
  cachedClient = new DocumentProcessorServiceClient({ keyFile });
  return cachedClient;
}

function processorName(): string {
  const project = process.env.DOCAI_PROJECT_ID;
  const location = process.env.DOCAI_LOCATION;
  const processor = process.env.DOCAI_PROCESSOR_ID;
  if (!project || !location || !processor) {
    throw new DocAIError(
      "DOCAI_PROJECT_ID / DOCAI_LOCATION / DOCAI_PROCESSOR_ID must be set",
      "auth",
    );
  }
  return `projects/${project}/locations/${location}/processors/${processor}`;
}

// Fetch a PDF (signed URL) and base64-encode it for the inline-bytes request.
async function fetchPdfBytes(signedUrl: string): Promise<Buffer> {
  const r = await fetch(signedUrl);
  if (!r.ok) {
    throw new DocAIError(
      `Failed to download PDF: ${r.status}`,
      "transport",
    );
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

// Resolve a textAnchor (the indirection Doc AI uses to refer to substrings of
// the full document.text) to its concrete string.
function resolveText(
  documentText: string,
  textAnchor: { textSegments?: Array<{ startIndex?: string | number; endIndex?: string | number }> } | null | undefined,
): string {
  if (!textAnchor?.textSegments) return "";
  let out = "";
  for (const seg of textAnchor.textSegments) {
    const start = Number(seg.startIndex ?? 0);
    const end = Number(seg.endIndex ?? 0);
    out += documentText.slice(start, end);
  }
  return out;
}

// Layer 1 of the extraction pipeline (Doc AI variant): high-fidelity OCR with
// per-word bboxes. Returns plain text + token-level bboxes for the bbox hover
// feature, plus a fullMarkdown string for the categorizer.
export async function ocrDocument(signedUrl: string): Promise<DocAiResult> {
  const c = client();
  const pdfBytes = await fetchPdfBytes(signedUrl);

  let response;
  try {
    [response] = await c.processDocument({
      name: processorName(),
      rawDocument: {
        content: pdfBytes,
        mimeType: "application/pdf",
      },
      // Future: imagelessMode: true would skip returning page images we don't use.
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
      throw new DocAIError(`Doc AI auth failed: ${message}`, "auth", err);
    }
    throw new DocAIError(`Doc AI call failed: ${message}`, "transport", err);
  }

  const document = response.document;
  if (!document) {
    throw new DocAIError("Doc AI returned no document", "schema");
  }

  const fullText = document.text ?? "";
  const rawPages = document.pages ?? [];

  const pages: DocAiPage[] = rawPages.map((p, idx) => {
    const pageIndex = idx + 1;
    const pageWidth = p.dimension?.width ?? 0;
    const pageHeight = p.dimension?.height ?? 0;

    const pageText = resolveText(fullText, p.layout?.textAnchor);

    const tokens: DocAiToken[] = (p.tokens ?? []).map((t) => {
      const text = resolveText(fullText, t.layout?.textAnchor).replace(/\n+/g, " ");
      const vertices =
        t.layout?.boundingPoly?.normalizedVertices ??
        t.layout?.boundingPoly?.vertices ??
        [];

      // Doc AI returns 4 vertices (quad). Compute the axis-aligned enclosing rect.
      let xs: number[] = [];
      let ys: number[] = [];
      if (vertices.length > 0) {
        const isNormalized = vertices === t.layout?.boundingPoly?.normalizedVertices;
        xs = vertices.map((v) =>
          isNormalized ? (v.x ?? 0) : (pageWidth > 0 ? (v.x ?? 0) / pageWidth : 0),
        );
        ys = vertices.map((v) =>
          isNormalized ? (v.y ?? 0) : (pageHeight > 0 ? (v.y ?? 0) / pageHeight : 0),
        );
      }
      const x = xs.length ? Math.min(...xs) : 0;
      const y = ys.length ? Math.min(...ys) : 0;
      const width = xs.length ? Math.max(...xs) - x : 0;
      const height = ys.length ? Math.max(...ys) - y : 0;

      return {
        text,
        bbox: {
          page: pageIndex,
          x: Math.max(0, Math.min(1, x)),
          y: Math.max(0, Math.min(1, y)),
          width: Math.max(0, Math.min(1, width)),
          height: Math.max(0, Math.min(1, height)),
        },
        confidence:
          typeof t.layout?.confidence === "number" ? t.layout.confidence : null,
      };
    });

    return {
      index: pageIndex,
      text: pageText,
      width: pageWidth,
      height: pageHeight,
      tokens,
    };
  });

  const fullMarkdown = pages
    .map((p) => `--- Page ${p.index} ---\n${p.text}`)
    .join("\n\n");

  // Strip the heavy textChanges/entities/etc. from raw before persisting;
  // keep just shape that's useful for debug.
  const raw = {
    text: fullText,
    pageCount: pages.length,
    // Don't dump the full pages/tokens to DB — too verbose. The tokens we need
    // are already in pages[].tokens on our return.
  };

  return { pages, fullMarkdown, raw };
}
