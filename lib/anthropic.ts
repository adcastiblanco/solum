import Anthropic from "@anthropic-ai/sdk";
import {
  EXTRACTABLE_FIELDS,
  FIELD_DEFS,
  type ExtractedField,
  type ExtractedFields,
  type FieldValue,
  type TableRow,
} from "./types";

const MODEL = "claude-sonnet-4-5";

export class CategorizationError extends Error {
  constructor(
    message: string,
    readonly kind: "transport" | "schema" | "unknown",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CategorizationError";
  }
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CategorizationError(
      "ANTHROPIC_API_KEY is not configured",
      "transport",
    );
  }
  return new Anthropic({ apiKey });
}

// Build a compact JSON-schema-style description that Claude can map the
// markdown onto. We only include extractable fields — the rest stay null
// and the human reviewer fills them in on the UI.
function buildSchemaDescription(): string {
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

const SYSTEM_PROMPT = `You are a clinical document categorizer. You receive OCR markdown from a medical document (referral letter, clinical note, insurance card, lab report, intake form, etc.) and must map its content into the Service Request Form schema.

Rules:
- Return null for any field not present in the document. Do not invent values.
- For ICD-10 codes ("service.icd10_codes") capture EVERY diagnosis code you can find in the document, not only the principal diagnoses. Include comorbidities and historical conditions explicitly stated as ICD-10 codes.
- For clinical history ("clinical.history") concatenate ALL clinical narrative sections (subjective, objective, plan, family history, medical history) into one coherent paragraph. Don't pick only one section.
- For medications ("clinical.medications") return one row per medication with medication / dose / frequency / prescriber. Use empty string "" for sub-fields you cannot determine (not null).
- For assessment scores ("clinical.assessments") return one row per validated instrument (e.g. PHQ-9, PCL-5) with tool / score / date.
- Preserve the exact spelling and punctuation from the document. Do NOT correct typos or OCR artifacts — the reviewer will fix those.
- For the patient/member name, split into last_name / first_name / middle_initial when the document presents them that way; otherwise put the full name in last_name and leave first_name/middle_initial null.
- For each field, also provide a confidence score (0.0–1.0) based on how clearly the value is stated, and a verbatim quote from the markdown that supports the value.

Output: a single JSON object (no prose, no markdown fences) with this shape:
{
  "fields": {
    "<field_name>": { "value": <typed value or null>, "confidence": <0.0-1.0>, "source_quote": "<verbatim text from markdown or null>" },
    ...
  }
}`;

type RawFieldResponse = {
  value: unknown;
  confidence?: unknown;
  source_quote?: unknown;
};

function coerceFieldValue(
  fieldName: string,
  raw: unknown,
): FieldValue {
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
    case "table":
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

export type CategorizationResult = {
  fields: ExtractedFields;
  rawClaudeResponse: unknown;
};

export async function categorizeMarkdown(
  markdown: string,
): Promise<CategorizationResult> {
  const anthropic = client();

  const userMessage = `OCR markdown from the document:

\`\`\`markdown
${markdown}
\`\`\`

Schema (extractable fields only — non-extractable form fields like service type, dates, justification are handled separately):

${buildSchemaDescription()}

Return the JSON object as specified.`;

  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CategorizationError(
      `Claude call failed: ${message}`,
      "transport",
      err,
    );
  }

  const text = response.content
    .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  if (!text) {
    throw new CategorizationError(
      "Claude returned no text content",
      "schema",
    );
  }

  // Claude is asked to return raw JSON, but sometimes wraps in fences anyway.
  const jsonText = stripCodeFences(text);

  let parsed: { fields?: Record<string, RawFieldResponse> };
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new CategorizationError(
      `Claude response was not valid JSON: ${jsonText.slice(0, 200)}`,
      "schema",
      err,
    );
  }

  const rawFields = parsed.fields ?? {};

  // Build the full ExtractedFields list — one entry per FIELD_NAMES, with
  // null defaults for non-extractable / missing entries.
  const fields: ExtractedField[] = EXTRACTABLE_FIELDS.map((name) => {
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

  return { fields, rawClaudeResponse: response };
}

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenced) return fenced[1].trim();
  return trimmed;
}
