import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Three-branch ensemble extraction:
//   1. Doc AI (OCR + per-token bboxes)  →  markdown  →  GPT-4o-mini structurer
//   2. OpenAI vision (GPT-4o reads the PDF directly)
//   3. Claude vision (Sonnet 4.5 reads the PDF directly)
// All three return ExtractedField[] under the same schema; the reconciler
// votes per field; the final values get bboxes grounded against Doc AI
// tokens (the only branch that produces reliable per-word bboxes).
import { fetchPdfBytes, ocrDocument, DocAIError } from "@/lib/docai";
import { mimeFromFileName } from "@/lib/mime";
import { structureMarkdown } from "@/lib/docai-structurer";
import { extractWithOpenAI } from "@/lib/openai-extractor";
import { extractWithAnthropic } from "@/lib/anthropic-extractor";
import { reconcile, type BranchResult } from "@/lib/reconciler";
import { groundFieldsWithTokens } from "@/lib/bbox-grounding";
import { ExtractorError } from "@/lib/extractor-shared";
import type { ExtractedField } from "@/lib/types";

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
    .select("id, storage_path, user_id, file_name")
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

    const fileBytes = await fetchPdfBytes(signed.signedUrl);
    const mimeType = mimeFromFileName(doc.file_name);

    // Doc AI has to finish first because the structurer reads its markdown
    // and the grounding step needs its tokens. The vision branches don't
    // depend on Doc AI, so we launch them alongside the structurer.
    const ocr = await ocrDocument(fileBytes, mimeType);

    const [structuredDocAi, openaiResult, anthropicResult] = await Promise.allSettled([
      structureMarkdown(ocr.fullMarkdown),
      extractWithOpenAI(fileBytes, mimeType),
      extractWithAnthropic(fileBytes, mimeType),
    ]);

    const branches: BranchResult[] = [];
    const errors: Record<string, string> = {};

    if (structuredDocAi.status === "fulfilled") {
      branches.push({ name: "docai", fields: structuredDocAi.value.fields });
    } else {
      errors.docai = errMsg(structuredDocAi.reason);
    }
    if (openaiResult.status === "fulfilled") {
      branches.push({ name: "openai", fields: openaiResult.value.fields });
    } else {
      errors.openai = errMsg(openaiResult.reason);
    }
    if (anthropicResult.status === "fulfilled") {
      branches.push({ name: "anthropic", fields: anthropicResult.value.fields });
    } else {
      errors.anthropic = errMsg(anthropicResult.reason);
    }

    if (branches.length === 0) {
      throw new ExtractorError(
        `All extraction branches failed: ${JSON.stringify(errors)}`,
        "transport",
      );
    }

    const { fields: reconciledFields, meta } = reconcile(branches);

    const grounded: ExtractedField[] = groundFieldsWithTokens(
      reconciledFields,
      ocr.pages,
    );

    const { data: extraction, error: extractionErr } = await supabase
      .from("extractions")
      .insert({
        document_id: documentId,
        raw_extractor_response: {
          ocr: ocr.raw,
          pages: ocr.pages,
          markdown: ocr.fullMarkdown,
          branches: {
            docai:
              structuredDocAi.status === "fulfilled"
                ? structuredDocAi.value
                : { error: errors.docai },
            openai:
              openaiResult.status === "fulfilled"
                ? openaiResult.value
                : { error: errors.openai },
            anthropic:
              anthropicResult.status === "fulfilled"
                ? anthropicResult.value
                : { error: errors.anthropic },
          },
          reconciliation: meta,
        },
        extracted_fields: grounded,
      })
      .select("id")
      .single();

    if (extractionErr) {
      throw new ExtractorError(
        `Failed to persist extraction: ${extractionErr.message}`,
        "transport",
      );
    }

    await supabase
      .from("documents")
      .update({ status: "done", error_message: null })
      .eq("id", documentId);

    return NextResponse.json({
      extractionId: extraction.id,
      fields: grounded,
      reconciliation: meta,
      branchErrors: errors,
    });
  } catch (err) {
    const message = toUserMessage(err);

    await supabase
      .from("documents")
      .update({ status: "error", error_message: message })
      .eq("id", documentId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
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
  if (err instanceof ExtractorError) {
    return `Extraction failed: ${err.message}`.slice(0, 200);
  }
  return "Extraction failed — try again";
}
