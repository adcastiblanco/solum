import type { SupabaseClient } from "@supabase/supabase-js";
import type { BBox, FieldValue } from "./types";

export type { FieldValue } from "./types";

export type ApproveFieldInput = {
  extractionId: string;
  fieldName: string;
  originalValue: FieldValue;
  finalValue: FieldValue;
  confidence: number | null;
  bbox: BBox | null;
};

export type FieldReviewRow = {
  extraction_id: string;
  field_name: string;
  original_value: string | null;
  final_value: string | null;
  was_edited: boolean;
  approved: boolean;
  confidence: number | null;
  bbox: BBox | null;
};

// JSON-encode values so strings, lists, and table rows round-trip through a
// single text column. null stays null.
export function serializeValue(v: FieldValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    return v.length === 0 ? null : JSON.stringify(v);
  }
  if (!Array.isArray(v) || v.length === 0) return null;
  // Array of strings or array of TableRow — JSON handles both, just drop blanks.
  if (typeof v[0] === "string") {
    const cleaned = (v as string[]).filter((s) => s.length > 0);
    return cleaned.length === 0 ? null : JSON.stringify(cleaned);
  }
  // TableRow[] — drop rows where all columns are empty
  const cleanedRows = (v as Array<Record<string, string>>).filter((row) =>
    Object.values(row).some((s) => (s ?? "").trim().length > 0),
  );
  return cleanedRows.length === 0 ? null : JSON.stringify(cleanedRows);
}

export function deserializeValue(s: string | null): FieldValue {
  if (s === null) return null;
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return s;
  }
}

export async function approveField(
  supabase: SupabaseClient,
  input: ApproveFieldInput,
): Promise<FieldReviewRow> {
  const { extractionId, fieldName, originalValue, finalValue, confidence, bbox } =
    input;

  const serializedOriginal = serializeValue(originalValue);
  const serializedFinal = serializeValue(finalValue);

  // We need to read the existing row to compute was_edited correctly (it
  // should monotonically advance and ONLY count edits when the AI had
  // populated the field in the first place). The row may not exist yet on
  // first approve.
  const { data: existing, error: selectErr } = await supabase
    .from("field_reviews")
    .select("original_value, was_edited")
    .eq("extraction_id", extractionId)
    .eq("field_name", fieldName)
    .maybeSingle();
  if (selectErr) throw selectErr;

  // "Original" = the value the AI originally produced. Once persisted, we
  // never overwrite it — concurrent reviewers all see the same baseline.
  const persistedOriginal = existing
    ? existing.original_value
    : serializedOriginal;

  const wasEdited = existing
    ? existing.was_edited ||
      (existing.original_value !== null &&
        serializedFinal !== existing.original_value)
    : serializedOriginal !== null && serializedFinal !== serializedOriginal;

  // Upsert is idempotent against the unique (extraction_id, field_name)
  // constraint, so two concurrent "approve" requests for the same field
  // (e.g. auto-on-blur + bulk-approve-section racing) don't crash on a
  // duplicate-key error — the later write just updates the row.
  const { data: row, error: upsertErr } = await supabase
    .from("field_reviews")
    .upsert(
      {
        extraction_id: extractionId,
        field_name: fieldName,
        original_value: persistedOriginal,
        final_value: serializedFinal,
        was_edited: wasEdited,
        approved: true,
        confidence,
        bbox,
      },
      { onConflict: "extraction_id,field_name" },
    )
    .select(
      "extraction_id, field_name, original_value, final_value, was_edited, approved, confidence, bbox",
    )
    .single();

  if (upsertErr) throw upsertErr;
  return row as FieldReviewRow;
}
