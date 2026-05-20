// Shared prompt + parsing logic used by every extractor branch (Doc AI
// structurer, OpenAI vision, Claude vision). Keeping this in one file ensures
// the three branches receive identical schema descriptions and reply parsing
// rules — diversity should come from the model, not from accidental prompt
// drift between files.

import {
  EXTRACTABLE_FIELDS,
  FIELD_DEFS,
  type ExtractedField,
  type FieldValue,
  type TableRow,
} from "./types";

export class ExtractorError extends Error {
  constructor(
    message: string,
    readonly kind: "transport" | "schema" | "auth" | "unknown",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExtractorError";
  }
}

export function buildSchemaDescription(): string {
  return EXTRACTABLE_FIELDS.map((name) => {
    const def = FIELD_DEFS[name];
    let shape: string;
    switch (def.type) {
      case "text":
      case "longtext":
        shape = "string | null";
        break;
      case "list":
        shape = "string[] | null";
        break;
      case "table": {
        const cols = (def.columns ?? []).map((c) => `"${c.key}": string`).join(", ");
        shape = `Array<{ ${cols} }> | null`;
        break;
      }
    }
    return `- "${name}" (${def.label}): ${shape}`;
  }).join("\n");
}

// The base instructions both vision extractors and the Doc AI structurer use.
// Vision branches see the PDF directly; the Doc AI structurer sees Doc AI's
// OCR markdown. Field rules are identical so the ensemble votes on like-for-
// like outputs.
export const SYSTEM_PROMPT_BASE = `You extract structured data from medical documents (referral letters, clinical notes, insurance cards, lab reports, intake forms, handwritten clinical notes, service request forms). The target schema is a clinical Service Request Form.

First, decide whether the document is in scope:
- IN SCOPE = a clinical / medical / insurance document relevant to a healthcare service request. Examples: clinical notes (SOAP, H&P, progress, discharge), referral letters, prior-authorization requests, insurance cards or eligibility statements, lab reports, imaging reports, prescriptions, patient intake forms, medication lists, handwritten clinician notes.
- OUT OF SCOPE = anything else. Examples: restaurant menus, receipts, contracts, marketing material, resumes, instruction manuals, generic letters, blank pages with no clinical content, screenshots of unrelated apps, software documentation.

If the document is OUT OF SCOPE, do not attempt to fill the schema. Return:
{ "is_medical_document": false, "out_of_scope_reason": "<one short sentence stating what the document actually is>", "fields": {} }

If the document is IN SCOPE, proceed with extraction. For each extractable field return:
- value: the typed value (per the field's type) or null when absent
- confidence: 0.0-1.0 based on how clearly the value is stated
- source_quote: a short verbatim quote from the document that supports the value (or null)

Mapping principles (apply these to every field):
- Map by SEMANTICS, not by literal label match. Source documents rarely use the exact field names of the target form. A value belongs to a field when its meaning, shape, and surrounding context match that field — even if the document's label is abbreviated, informal, hand-written, shortened, prefixed/suffixed, or implied by layout (e.g. a value following a colon on a labeled line, a value under a column header, a value next to a known marker symbol).
- Use surrounding context as evidence. The section a value appears in, the values immediately before/after it, and the document type all inform which field it belongs to. Two values with identical syntax can belong to different fields depending on context.
- Use shape and format as evidence. Each field has a typical shape (fixed length, character class, separator pattern, prefix/suffix conventions). When a value's shape matches a field's typical format AND the surrounding context is consistent with that field, prefer mapping it rather than returning null.
- Be willing to make an inferential map when evidence is consistent, and reflect that uncertainty in the confidence score (lower confidence for inferred maps, higher for explicitly labeled ones). null is for "the document genuinely does not contain this information", not "the label was not an exact match".
- Never fabricate. Do not invent IDs, codes, dates, names, or values that are not anchored to text actually present in the document. When in doubt between inferring from real text vs. inventing, choose null.
- Disambiguate fields with similar shapes by context: a 9- or 10-digit number near billing/tax context vs. near provider identity vs. near member enrollment is a different field even though the syntax looks alike.

Field-specific rules:
- ICD-10 codes ("service.icd10_codes"): capture EVERY diagnosis code you can find (e.g. F33.1, F41.1, Z63.4), including comorbidities and historical conditions stated as ICD-10 codes. Order them as they appear.
- CPT/HCPCS codes ("service.cpt_codes"): capture every billing/procedure code (5-digit CPT, alphanumeric HCPCS).

The three clinical-narrative fields below partition the document by TEMPORAL ORIENTATION. A sentence belongs to exactly one of them — never copy the same content into more than one. If the document is a SOAP-style note (Subjective / Objective / Assessment / Plan), use these mappings:
- Presenting symptoms ("clinical.presenting_symptoms") — PRESENT only: the current chief complaint, current symptoms, current functional impairment, and objective findings from this visit. Typically derived from the Subjective + Objective sections describing how the patient IS NOW. Do NOT include past treatments, prior medication response, or any forward plan.
- Clinical history ("clinical.history") — PAST: prior treatments and medications already tried (and when they were started), prior responses and outcomes, relevant past medical / family / social history, prior assessment scores referenced for comparison ("was 21 on 1/15"), and the assessment/impression statement that links past to present. If the past information is embedded in a narrative Subjective section rather than a separate PMH header, EXTRACT THOSE PAST PHRASES anyway — write a concise sentence capturing only the past elements (e.g. "Started Lexapro 10mg 3 weeks ago; prior PHQ-9 was 21 on 1/15; MDD recurrent moderate, improving on current regimen"). Do NOT return null just because the document lacks a dedicated history section. Do NOT include current symptoms in full (those belong in presenting_symptoms), and do NOT include the forward plan.
- Treatment goals ("clinical.treatment_goals") — FUTURE only: the clinician's proposed plan — medications to continue / start / titrate, dose changes, therapy frequency, follow-up cadence, labs ordered, expected outcomes. Typically the Plan section of a SOAP note. Do NOT include current symptoms or past history.

Other clinical fields:
- Medications ("clinical.medications"): one row per medication with medication / dose / frequency / prescriber. Use empty string "" for sub-fields you cannot determine (NOT null).
- Assessment scores ("clinical.assessments"): TODAY'S validated assessment scores from the current visit only. One row per instrument (PHQ-9, GAD-7, PCL-5, AUDIT, etc.) with tool / score / date. If the document shows a current value alongside a historical one (e.g. "PHQ-9: 14 (was 21 on 1/15)"), the current row is { tool: "PHQ-9", score: "14", date: <today's visit date> }. The prior value ("21 on 1/15") belongs in clinical.history, NOT here. Omit purely historical scores; this field is the latest measurement only.

Other rules:
- Member name: if the document presents Last, First, MI separately, split accordingly. Otherwise put the full name in last_name and leave first_name / middle_initial null.
- Preserve exact spelling and punctuation from the source. Do NOT correct typos or OCR artifacts — the reviewer will fix those.
- If multiple values exist for a single-value field, prefer the most recent or most explicit.

Output: a single JSON object (no prose, no markdown fences) with this shape:
{
  "is_medical_document": true,
  "fields": {
    "<field_name>": { "value": <typed value or null>, "confidence": <0.0-1.0>, "source_quote": "<short verbatim or null>" },
    ...
  }
}
or, for out-of-scope documents:
{ "is_medical_document": false, "out_of_scope_reason": "...", "fields": {} }`;

export type RawFieldResponse = {
  value: unknown;
  confidence?: unknown;
  source_quote?: unknown;
};

export function coerceFieldValue(fieldName: string, raw: unknown): FieldValue {
  if (raw === null || raw === undefined) return null;
  const def = FIELD_DEFS[fieldName];
  if (!def) return null;

  switch (def.type) {
    case "text":
    case "longtext":
      if (typeof raw === "string") return raw.trim().length === 0 ? null : raw.trim();
      if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
      return null;
    case "list":
      if (Array.isArray(raw)) {
        const cleaned = raw
          .map((v) => (v == null ? null : String(v).trim()))
          .filter((v): v is string => v != null && v.length > 0);
        return cleaned.length === 0 ? null : cleaned;
      }
      if (typeof raw === "string" && raw.trim().length > 0) return [raw.trim()];
      return null;
    case "table": {
      if (!Array.isArray(raw)) return null;
      const cols = def.columns ?? [];
      const rows = raw
        .map((row): TableRow | null => {
          if (!row || typeof row !== "object") return null;
          const obj = row as Record<string, unknown>;
          const out: TableRow = {};
          let anyValue = false;
          for (const c of cols) {
            const v = obj[c.key];
            const s = v == null ? "" : String(v).trim();
            out[c.key] = s;
            if (s.length > 0) anyValue = true;
          }
          return anyValue ? out : null;
        })
        .filter((r): r is TableRow => r != null);
      return rows.length === 0 ? null : rows;
    }
  }
}

export function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

// Read the top-level relevance verdict the branch returned. Treats a
// missing flag as "in scope" so older prompt versions / lenient responses
// don't accidentally suppress everything.
export type BranchRelevance = {
  isMedicalDocument: boolean;
  outOfScopeReason: string | null;
};

export function readBranchRelevance(parsed: unknown): BranchRelevance {
  if (!parsed || typeof parsed !== "object") {
    return { isMedicalDocument: true, outOfScopeReason: null };
  }
  const obj = parsed as { is_medical_document?: unknown; out_of_scope_reason?: unknown };
  const flag = obj.is_medical_document;
  if (flag === false) {
    const reason = typeof obj.out_of_scope_reason === "string" ? obj.out_of_scope_reason : null;
    return { isMedicalDocument: false, outOfScopeReason: reason };
  }
  return { isMedicalDocument: true, outOfScopeReason: null };
}

// Given the parsed `{ fields: { ... } }` payload from any branch, normalize it
// into the canonical ExtractedField[] shape. bbox is left null here — each
// branch (or the post-reconciler grounding step) attaches it separately.
export function normalizeBranchFields(parsed: unknown): ExtractedField[] {
  const rawFields =
    parsed && typeof parsed === "object" && "fields" in parsed
      ? ((parsed as { fields?: Record<string, RawFieldResponse> }).fields ?? {})
      : {};

  return EXTRACTABLE_FIELDS.map((name): ExtractedField => {
    const r = rawFields[name];
    if (!r || typeof r !== "object") {
      return { name, value: null, confidence: null, bbox: null, source_quote: null };
    }
    const value = coerceFieldValue(name, r.value);
    const confidence =
      typeof r.confidence === "number" && Number.isFinite(r.confidence)
        ? Math.max(0, Math.min(1, r.confidence))
        : null;
    const source_quote = typeof r.source_quote === "string" ? r.source_quote : null;
    return { name, value, confidence, bbox: null, source_quote };
  });
}

export function userInstruction(): string {
  return `Extract every value you can find that fits the schema below. If a value isn't in the document, return null — never invent.

Schema (extractable fields):

${buildSchemaDescription()}

Return the JSON object as specified.`;
}
