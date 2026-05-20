import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FIELD_NAMES, type ExtractedField } from "@/lib/types";
import { deserializeValue, type FieldValue } from "@/lib/field-reviews";
import { mimeFromFileName } from "@/lib/mime";
import type { ReconciliationMeta } from "@/lib/reconciler";
import { ReviewClient, type InitialReview } from "./review-client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, status, storage_path, error_message")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) notFound();

  const { data: extraction } = await supabase
    .from("extractions")
    .select("id, extracted_fields, raw_extractor_response, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60 * 30);

  const pdfUrl = signed?.signedUrl ?? null;

  const rawFields = (extraction?.extracted_fields ?? []) as ExtractedField[];
  const byName = new Map(rawFields.map((f) => [f.name, f]));
  const fields: ExtractedField[] = FIELD_NAMES.map(
    (name) =>
      byName.get(name) ?? {
        name,
        value: null,
        confidence: null,
        bbox: null,
      },
  );

  // Reconciliation metadata: the ensemble's per-field agreement state, used
  // to highlight fields where the 3 extractor branches disagreed or only one
  // branch produced a value. Older extractions (pre-ensemble) won't have it.
  const rawResponse = (extraction?.raw_extractor_response ?? null) as
    | { reconciliation?: ReconciliationMeta[] }
    | null;
  const reconciliation: Record<string, ReconciliationMeta> = {};
  for (const m of rawResponse?.reconciliation ?? []) {
    reconciliation[m.field] = m;
  }

  const initialReviews: Record<string, InitialReview> = {};
  if (extraction?.id) {
    const { data: reviews } = await supabase
      .from("field_reviews")
      .select("field_name, final_value, approved")
      .eq("extraction_id", extraction.id);
    for (const r of reviews ?? []) {
      if (!r.approved) continue;
      initialReviews[r.field_name] = {
        finalValue: deserializeValue(r.final_value) as FieldValue,
        approved: true,
      };
    }
  }

  return (
    <ReviewClient
      documentId={doc.id}
      extractionId={extraction?.id ?? null}
      fileName={doc.file_name}
      status={doc.status}
      pdfUrl={pdfUrl}
      mimeType={mimeFromFileName(doc.file_name)}
      fields={fields}
      initialReviews={initialReviews}
      reconciliation={reconciliation}
    />
  );
}
