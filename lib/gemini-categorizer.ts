import {
  EXTRACTABLE_FIELDS,
  FIELD_DEFS,
  type ExtractedField,
  type ExtractedFields,
  type FieldValue,
  type TableRow,
} from "./types";

// Temporary stand-in for the Claude-based categorizer in lib/anthropic.ts.
// Same signature, same return shape — swap the import in /api/extract when the
// Anthropic key is available again.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) {
    throw new CategorizationError(
      "GEMINI_API_KEY is not configured",
      "transport",
    );
  }
  return k;
}

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

function coerceFieldValue(fieldName: string, raw: unknown): FieldValue {
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

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

export type CategorizationResult = {
  fields: ExtractedFields;
  rawCategorizerResponse: unknown;
};

export async function categorizeMarkdown(
  markdown: string,
): Promise<CategorizationResult> {
  const userMessage = `OCR markdown from the document:

\`\`\`markdown
${markdown}
\`\`\`

Schema (extractable fields only — non-extractable form fields like service type, dates, justification are handled separately):

${buildSchemaDescription()}

Return the JSON object as specified.`;

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 16384,
    },
  });

  // Gemini Flash returns 503 ("model is currently experiencing high demand")
  // under load. Retry with exponential backoff on 503/429/5xx.
  const MAX_ATTEMPTS = 4;
  let resp: Response | null = null;
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(`${ENDPOINT}?key=${apiKey()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (r.ok) {
        resp = r;
        break;
      }
      const text = await r.text();
      lastError = `${r.status}: ${text.slice(0, 200)}`;
      const isRetryable = r.status === 503 || r.status === 429 || r.status >= 500;
      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw new CategorizationError(
          `Gemini ${lastError}`,
          "transport",
        );
      }
      // Backoff: 1s, 3s, 7s
      const delayMs = 1000 * (Math.pow(2, attempt) - 1);
      await new Promise((res) => setTimeout(res, delayMs));
    } catch (err) {
      if (err instanceof CategorizationError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_ATTEMPTS) {
        throw new CategorizationError(
          `Gemini call failed: ${message}`,
          "transport",
          err,
        );
      }
      lastError = message;
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }

  if (!resp) {
    throw new CategorizationError(
      `Gemini call failed after retries: ${lastError}`,
      "transport",
    );
  }

  const body = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new CategorizationError(
      "Gemini returned no text content",
      "schema",
    );
  }

  const jsonText = stripCodeFences(rawText);

  let parsed: { fields?: Record<string, RawFieldResponse> };
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new CategorizationError(
      `Gemini response was not valid JSON: ${jsonText.slice(0, 200)}`,
      "schema",
      err,
    );
  }

  const rawFields = parsed.fields ?? {};

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

  return { fields, rawCategorizerResponse: body };
}
