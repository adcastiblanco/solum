import { Mistral } from "@mistralai/mistralai";
import {
  ARRAY_FIELDS,
  FIELD_NAMES,
  type ExtractedField,
  type ExtractedFields,
} from "./types";

const MODEL = "mistral-ocr-2505";

export class MistralExtractionError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "transport" | "schema" | "unknown",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MistralExtractionError";
  }
}

function buildSchema() {
  const properties: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    properties[name] = {
      type: ["object", "null"],
      properties: {
        value: { type: [...(ARRAY_FIELDS.has(name) ? ["array"] : ["string"]), "null"] as string[] },
        confidence: { type: ["number", "null"] },
        bbox: {
          type: ["object", "null"],
          properties: {
            page: { type: "integer" },
            x: { type: "number" },
            y: { type: "number" },
            width: { type: "number" },
            height: { type: "number" },
          },
          required: ["page", "x", "y", "width", "height"],
        },
      },
      required: ["value", "confidence", "bbox"],
    };
  }
  return {
    type: "object",
    properties,
    required: FIELD_NAMES,
    additionalProperties: false,
  };
}

const EXTRACTION_PROMPT = `You are a medical records specialist. Extract every clinical and patient field from this document.
For each field, return an object { value, confidence, bbox }:
- value: the extracted value as a string (or array of strings for list fields). Return null if the field is not present.
- confidence: a number between 0.0 and 1.0 reflecting legibility and certainty. Lower for handwriting or partial occlusion.
- bbox: a single enclosing rectangle covering the field on the page, with { page, x, y, width, height } where coordinates are normalized 0–1 of the page. Return null if the field is not present.
Be thorough — fields that are obviously absent should be null, not guessed.`;

function client() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new MistralExtractionError(
      "MISTRAL_API_KEY is not configured",
      "transport",
    );
  }
  return new Mistral({ apiKey });
}

type RawField = {
  value?: unknown;
  confidence?: unknown;
  bbox?: unknown;
};

function normalizeField(name: string, raw: unknown): ExtractedField {
  if (!raw || typeof raw !== "object") {
    return { name, value: null, confidence: null, bbox: null };
  }
  const f = raw as RawField;

  let value: string | string[] | null = null;
  if (ARRAY_FIELDS.has(name)) {
    if (Array.isArray(f.value)) {
      value = f.value
        .map((v) => (v == null ? null : String(v)))
        .filter((v): v is string => v != null && v.length > 0);
      if (value.length === 0) value = null;
    } else if (typeof f.value === "string" && f.value.trim().length > 0) {
      value = [f.value];
    }
  } else {
    if (typeof f.value === "string" && f.value.trim().length > 0) {
      value = f.value;
    } else if (typeof f.value === "number" || typeof f.value === "boolean") {
      value = String(f.value);
    }
  }

  const confidence =
    typeof f.confidence === "number" && Number.isFinite(f.confidence)
      ? Math.max(0, Math.min(1, f.confidence))
      : null;

  let bbox: ExtractedField["bbox"] = null;
  if (f.bbox && typeof f.bbox === "object") {
    const b = f.bbox as Record<string, unknown>;
    const page = typeof b.page === "number" ? b.page : null;
    const x = typeof b.x === "number" ? b.x : null;
    const y = typeof b.y === "number" ? b.y : null;
    const width = typeof b.width === "number" ? b.width : null;
    const height = typeof b.height === "number" ? b.height : null;
    if (
      page != null &&
      x != null &&
      y != null &&
      width != null &&
      height != null
    ) {
      bbox = { page, x, y, width, height };
    }
  }

  return { name, value, confidence, bbox };
}

export async function extractDocument(
  signedUrl: string,
): Promise<{ fields: ExtractedFields; raw: unknown }> {
  const mistral = client();

  let response;
  try {
    response = await mistral.ocr.process({
      model: MODEL,
      document: { type: "document_url", documentUrl: signedUrl },
      includeImageBase64: false,
      documentAnnotationFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "clinical_document",
          schemaDefinition: buildSchema(),
          strict: true,
        },
      },
      documentAnnotationPrompt: EXTRACTION_PROMPT,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
      throw new MistralExtractionError(
        "Mistral OCR timed out",
        "timeout",
        err,
      );
    }
    if (/unsupported|invalid|cannot/i.test(message)) {
      throw new MistralExtractionError(
        `Unsupported document: ${message}`,
        "schema",
        err,
      );
    }
    throw new MistralExtractionError(
      `Mistral OCR failed: ${message}`,
      "transport",
      err,
    );
  }

  const annotation = response.documentAnnotation;
  if (!annotation) {
    throw new MistralExtractionError(
      "Mistral returned no document annotation",
      "schema",
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = typeof annotation === "string" ? JSON.parse(annotation) : annotation;
  } catch (err) {
    throw new MistralExtractionError(
      "Mistral document annotation was not valid JSON",
      "schema",
      err,
    );
  }

  const fields: ExtractedFields = FIELD_NAMES.map((name) =>
    normalizeField(name, parsed[name]),
  );

  return { fields, raw: response };
}
