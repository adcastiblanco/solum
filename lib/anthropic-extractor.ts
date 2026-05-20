// Claude vision branch. Reads the PDF directly via Anthropic's document
// content block (Sonnet 4.5 has strong vision + clinical reasoning). One
// call: PDF in, structured fields out. As with the OpenAI branch, bboxes
// come from Doc AI tokens at the grounding step after reconciliation.

import Anthropic from "@anthropic-ai/sdk";
import {
  ExtractorError,
  SYSTEM_PROMPT_BASE,
  normalizeBranchFields,
  readBranchRelevance,
  stripCodeFences,
  userInstruction,
} from "./extractor-shared";
import type { ExtractorResult } from "./types";

const MODEL = "claude-sonnet-4-5";

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ExtractorError("ANTHROPIC_API_KEY is not configured", "auth");
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export async function extractWithAnthropic(
  bytes: Buffer,
  mimeType: string = "application/pdf",
): Promise<ExtractorResult> {
  const base64 = bytes.toString("base64");
  const anthropic = client();

  // PDFs go in via the `document` content block; raster images go in via
  // `image`. Same model, different envelope — Claude vision handles both.
  const fileBlock: Anthropic.Messages.ContentBlockParam =
    mimeType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: base64,
          },
        };

  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT_BASE,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: userInstruction() }],
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExtractorError(`Claude vision call failed: ${message}`, "transport", err);
  }

  const text = response.content
    .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  if (!text) {
    throw new ExtractorError("Claude vision returned no content", "schema");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (err) {
    throw new ExtractorError(
      `Claude vision returned invalid JSON: ${text.slice(0, 200)}`,
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
