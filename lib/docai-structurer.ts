// Doc AI branch's structurer. Doc AI gives us OCR markdown + per-token
// bboxes, but no semantics — it doesn't know what an NPI or an ICD-10 code
// is. A small text-only model (GPT-4o-mini) reads the markdown and maps it
// to the Service Request Form schema. We picked GPT-4o-mini specifically so
// this branch isn't correlated with the Claude vision branch.
//
// Important: this structurer reads TEXT only. Section D checkboxes are
// invisible to it — that's fine, because the vision branches are responsible
// for those (and the schema marks "service.type" / "service.setting" as
// non-extractable anyway).

import OpenAI from "openai";
import {
  ExtractorError,
  SYSTEM_PROMPT_BASE,
  buildSchemaDescription,
  normalizeBranchFields,
  readBranchRelevance,
  stripCodeFences,
} from "./extractor-shared";
import type { ExtractorResult } from "./types";

const MODEL = "gpt-5-mini";

let cached: OpenAI | null = null;
function client(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ExtractorError("OPENAI_API_KEY is not configured", "auth");
  }
  cached = new OpenAI({ apiKey });
  return cached;
}

export async function structureMarkdown(markdown: string): Promise<ExtractorResult> {
  const userMessage = `OCR markdown extracted from the document by Google Document AI:

\`\`\`markdown
${markdown}
\`\`\`

Schema (extractable fields):

${buildSchemaDescription()}

Return the JSON object as specified.`;

  const openai = client();
  let response;
  try {
    // GPT-5 family only accepts the default temperature (1) — don't set it.
    // Determinism comes from the strict JSON schema + clear instructions.
    response = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT_BASE },
        { role: "user", content: userMessage },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExtractorError(`Doc AI structurer call failed: ${message}`, "transport", err);
  }

  const text = response.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new ExtractorError("Doc AI structurer returned no content", "schema");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (err) {
    throw new ExtractorError(
      `Doc AI structurer returned invalid JSON: ${text.slice(0, 200)}`,
      "schema",
      err,
    );
  }

  const relevance = readBranchRelevance(parsed);
  const fields = relevance.isMedicalDocument ? normalizeBranchFields(parsed) : [];
  return {
    fields,
    raw: response,
    isMedicalDocument: relevance.isMedicalDocument,
    outOfScopeReason: relevance.outOfScopeReason,
  };
}
