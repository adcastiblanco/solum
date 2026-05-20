// OpenAI vision branch. Reads the PDF directly with GPT-4o (vision) so the
// model sees the full layout — checkboxes, table rows, signatures — not just
// reconstructed text. We don't ask it to emit bboxes; those come from Doc AI
// tokens at the grounding step after the reconciler picks final values.

import OpenAI from "openai";
import {
  ExtractorError,
  SYSTEM_PROMPT_BASE,
  normalizeBranchFields,
  readBranchRelevance,
  stripCodeFences,
  userInstruction,
} from "./extractor-shared";
import type { ExtractorResult } from "./types";

const MODEL = "gpt-4o";

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

export async function extractWithOpenAI(
  bytes: Buffer,
  mimeType: string = "application/pdf",
): Promise<ExtractorResult> {
  const base64 = bytes.toString("base64");
  const openai = client();

  // PDFs go through the `file` content block (SDK is loose-typed for it);
  // raster images go through `image_url` with a data: URI.
  const fileBlock: OpenAI.Chat.Completions.ChatCompletionContentPart =
    mimeType === "application/pdf"
      ? ({
          type: "file",
          file: {
            filename: "document.pdf",
            file_data: `data:application/pdf;base64,${base64}`,
          },
        } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart)
      : {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` },
        };

  let response;
  try {
    response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT_BASE },
        {
          role: "user",
          content: [fileBlock, { type: "text", text: userInstruction() }],
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExtractorError(`OpenAI vision call failed: ${message}`, "transport", err);
  }

  const text = response.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new ExtractorError("OpenAI vision returned no content", "schema");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (err) {
    throw new ExtractorError(
      `OpenAI vision returned invalid JSON: ${text.slice(0, 200)}`,
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
