import type { SupabaseClient } from "@supabase/supabase-js";
import type { BBox } from "./types";

export type FieldValue = string | string[] | null;

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

// JSON-encode values so arrays and strings round-trip through a single text column.
// null stays null.
export function serializeValue(v: FieldValue): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    return v.length === 0 ? null : JSON.stringify(v);
  }
  const cleaned = v.filter((s) => s.length > 0);
  return cleaned.length === 0 ? null : JSON.stringify(cleaned);
}

export function deserializeValue(s: string | null): FieldValue {
  if (s === null) return null;
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "string" || Array.isArray(parsed)) return parsed;
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
    const wasEdited = serializedFinal !== serializedOriginal;
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

  // Existing row: monotonically advance was_edited; never overwrite the
  // original_value or confidence (they're a snapshot from extraction time).
  const wasEdited =
    existing.was_edited || serializedFinal !== existing.original_value;

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
