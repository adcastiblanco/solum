import OpenAI from "openai";
import type { DocAiPage, DocAiToken } from "./docai";
import {
  EXTRACTABLE_FIELDS,
  FIELD_DEFS,
  type BBox,
  type ExtractedField,
  type ExtractedFields,
  type FieldValue,
  type TableRow,
} from "./types";

// LLM categorizer using OpenAI (GPT-5.5).
//
// Architecture note: instead of asking the LLM for field values and then
// string-matching them back to Doc AI tokens, we pass the Doc AI tokens
// (each with a global index) AS the input, and ask the LLM to return the
// token indices that produced each field's value. We compute the bbox by
// unioning the referenced tokens' bboxes directly. No string matching.

const MODEL = "gpt-5.5";

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

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CategorizationError(
      "OPENAI_API_KEY is not configured",
      "transport",
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

// Flatten DocAi pages into a single globally-indexed token list. The bbox of
// each token already carries its page number, so we don't need to track that
// separately for bbox computation.
type IndexedToken = DocAiToken & { index: number };

function flattenTokens(pages: DocAiPage[]): IndexedToken[] {
  const out: IndexedToken[] = [];
  let i = 0;
  for (const p of pages) {
    for (const t of p.tokens) {
      out.push({ ...t, index: i });
      i++;
    }
  }
  return out;
}

// Render the token list into a compact string the LLM can read and reference
// by index. Format: `[0] Date\n[1] :\n[2] 2/5/26\n...` with page breaks
// indicated explicitly.
function renderTokens(tokens: IndexedToken[]): string {
  let currentPage = 0;
  const lines: string[] = [];
  for (const t of tokens) {
    if (t.bbox.page !== currentPage) {
      currentPage = t.bbox.page;
      lines.push(`\n=== Page ${currentPage} ===`);
    }
    // Strip newlines inside token text so each token is one line.
    const text = t.text.replace(/\s+/g, " ").trim();
    lines.push(`[${t.index}] ${text}`);
  }
  return lines.join("\n");
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

const SYSTEM_PROMPT = `You are a clinical document categorizer. You receive a list of OCR tokens (each with an index) extracted from a medical document (referral letter, clinical note, insurance card, lab report, intake form, etc.) and must map the content into the Service Request Form schema.

For each extractable field you must return:
- value: the typed value (see field's type spec) or null
- token_indices: the list of token indices whose text formed this value (or [] for null values)
- confidence: 0.0-1.0 based on how clearly the value is stated
- source_quote: a verbatim concatenation of the referenced tokens

Rules:
- Return null/[] for any field not present.
- For ICD-10 codes ("service.icd10_codes") capture EVERY diagnosis code in the document, not only principal diagnoses. Include comorbidities and historical conditions stated as ICD-10 codes.
- For clinical history ("clinical.history") concatenate ALL clinical narrative (subjective, objective, plan, family history, medical history) into one coherent paragraph. Provide token_indices spanning all referenced tokens.
- For medications ("clinical.medications") return one row per medication with medication / dose / frequency / prescriber. Use "" for sub-fields you cannot determine.
- For assessment scores ("clinical.assessments") return one row per validated instrument with tool / score / date.
- Preserve exact spelling and punctuation from the tokens. Do NOT correct typos or OCR artifacts.
- For the patient/member name, split into last_name / first_name / middle_initial when the document presents them that way; otherwise put the full name in last_name and leave first_name/middle_initial null.
- token_indices MUST reference tokens that actually contain the field's content. Do not invent indices.

For table-type fields (medications, assessments), token_indices refers to the ENTIRE table region (all rows). Per-cell bbox is out of scope.

Output: a single JSON object with this shape:
{
  "fields": {
    "<field_name>": {
      "value": <typed value or null>,
      "token_indices": [<int>, ...],
      "confidence": <0.0-1.0>,
      "source_quote": "<verbatim concatenation or null>"
    },
    ...
  }
}`;

type RawFieldResponse = {
  value: unknown;
  token_indices?: unknown;
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

function unionBbox(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  // Group by page; take the union of the page with the most tokens.
  const byPage = new Map<number, BBox[]>();
  for (const b of boxes) {
    const arr = byPage.get(b.page) ?? [];
    arr.push(b);
    byPage.set(b.page, arr);
  }
  let bestPage = boxes[0].page;
  let bestCount = 0;
  for (const [p, arr] of byPage) {
    if (arr.length > bestCount) {
      bestCount = arr.length;
      bestPage = p;
    }
  }
  const onPage = byPage.get(bestPage)!;
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;
  for (const b of onPage) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    page: bestPage,
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export type CategorizationResult = {
  fields: ExtractedFields;
  rawCategorizerResponse: unknown;
};

export async function categorizeMarkdown(
  _markdown: string,
  pages?: DocAiPage[],
): Promise<CategorizationResult> {
  if (!pages || pages.length === 0) {
    throw new CategorizationError(
      "OpenAI categorizer requires Doc AI pages with tokens",
      "schema",
    );
  }

  const tokens = flattenTokens(pages);
  const tokenList = renderTokens(tokens);

  const userMessage = `OCR tokens from the document (numbered):

${tokenList}

Extractable fields:

${buildSchemaDescription()}

Return the JSON object as specified, with token_indices referencing the indices above.`;

  const c = client();

  let response: OpenAI.Chat.Completions.ChatCompletion;
  try {
    response = await c.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CategorizationError(
      `OpenAI call failed: ${message}`,
      "transport",
      err,
    );
  }

  const rawText = response.choices?.[0]?.message?.content ?? "";
  if (!rawText) {
    throw new CategorizationError("OpenAI returned no content", "schema");
  }

  let parsed: { fields?: Record<string, RawFieldResponse> };
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new CategorizationError(
      `OpenAI response was not valid JSON: ${rawText.slice(0, 200)}`,
      "schema",
      err,
    );
  }

  const rawFields = parsed.fields ?? {};
  const tokensByIndex = new Map(tokens.map((t) => [t.index, t]));

  const fields: ExtractedField[] = EXTRACTABLE_FIELDS.map((name) => {
    const r = rawFields[name];
    if (!r || typeof r !== "object") {
      return {
        name,
        value: null,
        confidence: null,
        bbox: null,
        source_quote: null,
      };
    }
    const value = coerceFieldValue(name, r.value);

    // Resolve token indices → bbox via union, directly from Doc AI positions.
    let bbox: BBox | null = null;
    if (Array.isArray(r.token_indices) && r.token_indices.length > 0) {
      const boxes: BBox[] = [];
      for (const idx of r.token_indices) {
        if (typeof idx !== "number" || !Number.isFinite(idx)) continue;
        const t = tokensByIndex.get(idx);
        if (t) boxes.push(t.bbox);
      }
      bbox = unionBbox(boxes);
    }

    const confidence =
      typeof r.confidence === "number" && Number.isFinite(r.confidence)
        ? Math.max(0, Math.min(1, r.confidence))
        : null;
    const source_quote = typeof r.source_quote === "string" ? r.source_quote : null;
    return { name, value, confidence, bbox, source_quote };
  });

  return { fields, rawCategorizerResponse: response };
}
