import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// OCR layer 1: Google Document AI (best on handwriting + real per-word bboxes).
// Mistral OCR is kept in lib/mistral.ts as a fallback option.
import { ocrDocument, DocAIError } from "@/lib/docai";
// Categorizer layer 2: Gemini Flash. Swap to `@/lib/anthropic` (Claude Sonnet)
// when the Anthropic key is available — same signature.
import {
  categorizeMarkdown,
  CategorizationError,
} from "@/lib/gemini-categorizer";
import { groundFieldsWithTokens } from "@/lib/bbox-grounding";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let documentId: string | null = null;
  try {
    const body = (await req.json()) as { documentId?: string };
    documentId = body.documentId ?? null;
  } catch {
    // fall through
  }
  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, storage_path, user_id")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await supabase
    .from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", documentId);

  try {
    const { data: signed, error: signErr } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 600);

    if (signErr || !signed?.signedUrl) {
      throw new DocAIError(
        `Could not sign storage URL: ${signErr?.message ?? "unknown"}`,
        "transport",
      );
    }

    // Pipeline layer 1: Google Document AI → high-fidelity OCR + per-word
    // bboxes. The markdown feeds the categorizer; the page tokens are kept
    // for future bbox-highlight use.
    const ocr = await ocrDocument(signed.signedUrl);

    // Pipeline layer 2: LLM categorizer → maps OCR markdown to the Form 07 schema.
    const { fields: rawFields, rawCategorizerResponse } = await categorizeMarkdown(ocr.fullMarkdown);

    // Layer 3: anchor each field value to its bbox via token string-matching
    // against the Doc AI tokens. Honest about misses — if the value can't be
    // located, bbox stays null.
    const fields = groundFieldsWithTokens(rawFields, ocr.pages);

    const { data: extraction, error: extractionErr } = await supabase
      .from("extractions")
      .insert({
        document_id: documentId,
        raw_mistral_response: {
          ocr: ocr.raw,
          pages: ocr.pages, // tokens with bboxes for the highlight feature
          categorizer: rawCategorizerResponse,
          markdown: ocr.fullMarkdown,
        },
        extracted_fields: fields,
      })
      .select("id")
      .single();

    if (extractionErr) {
      throw new DocAIError(
        `Failed to persist extraction: ${extractionErr.message}`,
        "transport",
      );
    }

    await supabase
      .from("documents")
      .update({ status: "done", error_message: null })
      .eq("id", documentId);

    return NextResponse.json({ extractionId: extraction.id, fields });
  } catch (err) {
    const message = toUserMessage(err);

    await supabase
      .from("documents")
      .update({ status: "error", error_message: message })
      .eq("id", documentId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function toUserMessage(err: unknown): string {
  if (err instanceof DocAIError) {
    switch (err.kind) {
      case "auth":
        return "OCR auth failed — check service account";
      case "schema":
        return "Unsupported document format";
      case "transport":
        return "Document could not be read";
      default:
        return "OCR failed — try again";
    }
  }
  if (err instanceof CategorizationError) {
    return `Categorization failed: ${err.message.replace(/^(Claude|Gemini) call failed: /, "")}`.slice(0, 200);
  }
  return "Extraction failed — try again";
}
