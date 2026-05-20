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

  const { data: existing, error: selectErr } = await supabase
    .from("field_reviews")
    .select(
      "id, extraction_id, field_name, original_value, final_value, was_edited, approved, confidence, bbox",
    )
    .eq("extraction_id", extractionId)
    .eq("field_name", fieldName)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (!existing) {
    // was_edited only counts as a correction when there was an extracted value
    // to correct in the first place. Filling in a missing field (original null)
    // is a "fill-in", not a correction, and should NOT count against accuracy.
    const wasEdited =
      serializedOriginal !== null && serializedFinal !== serializedOriginal;
    const { data: inserted, error: insertErr } = await supabase
      .from("field_reviews")
      .insert({
        extraction_id: extractionId,
        field_name: fieldName,
        original_value: serializedOriginal,
        final_value: serializedFinal,
        was_edited: wasEdited,
        approved: true,
        confidence,
        bbox,
      })
      .select(
        "extraction_id, field_name, original_value, final_value, was_edited, approved, confidence, bbox",
      )
      .single();

    if (insertErr) throw insertErr;
    return inserted as FieldReviewRow;
  }

  // Existing row: monotonically advance was_edited, but only when the original
  // value was non-null (filling in a missing field doesn't count as editing).
  const wasEdited =
    existing.was_edited ||
    (existing.original_value !== null &&
      serializedFinal !== existing.original_value);

  const { data: updated, error: updateErr } = await supabase
    .from("field_reviews")
    .update({
      final_value: serializedFinal,
      was_edited: wasEdited,
      approved: true,
    })
    .eq("extraction_id", extractionId)
    .eq("field_name", fieldName)
    .select(
      "extraction_id, field_name, original_value, final_value, was_edited, approved, confidence, bbox",
    )
    .single();

  if (updateErr) throw updateErr;
  return updated as FieldReviewRow;
}
