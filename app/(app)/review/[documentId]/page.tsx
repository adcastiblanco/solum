import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FIELD_NAMES, type ExtractedField } from "@/lib/types";
import { ReviewClient } from "./review-client";

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
    .select("id, extracted_fields, created_at")
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

  return (
    <ReviewClient
      documentId={doc.id}
      fileName={doc.file_name}
      status={doc.status}
      pdfUrl={pdfUrl}
      fields={fields}
    />
  );
}
