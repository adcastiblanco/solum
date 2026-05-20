import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractDocument, MistralExtractionError } from "@/lib/mistral";

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
      throw new MistralExtractionError(
        `Could not sign storage URL: ${signErr?.message ?? "unknown"}`,
        "transport",
      );
    }

    const { fields, raw } = await extractDocument(signed.signedUrl);

    const { data: extraction, error: extractionErr } = await supabase
      .from("extractions")
      .insert({
        document_id: documentId,
        raw_mistral_response: raw,
        extracted_fields: fields,
      })
      .select("id")
      .single();

    if (extractionErr) {
      throw new MistralExtractionError(
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
    const message =
      err instanceof MistralExtractionError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Extraction failed";

    await supabase
      .from("documents")
      .update({ status: "error", error_message: message })
      .eq("id", documentId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
