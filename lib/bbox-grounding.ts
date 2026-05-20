import type { DocAiPage, DocAiToken } from "./docai";
import type { BBox, ExtractedField, FieldValue, TableRow } from "./types";

// Normalize a string for token matching: lowercase, strip punctuation that
// OCR may split inconsistently (commas, periods, parentheses, slashes), keep
// digits/letters/dots/hyphens that are usually meaningful in clinical text.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),:;'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

// Union of bboxes, all assumed to be on the same page (we ignore cross-page
// values for now — extremely rare for form fields).
function unionBboxes(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  const page = boxes[0].page;
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;
  for (const b of boxes) {
    if (b.page !== page) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    page,
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

// Find the first contiguous run of tokens whose normalized text matches the
// normalized words of `value`. Returns the matched tokens (or empty array).
function findTokenRun(
  needle: string,
  pages: DocAiPage[],
): DocAiToken[] {
  const words = tokenize(needle);
  if (words.length === 0) return [];

  for (const page of pages) {
    const tokens = page.tokens;
    const norms = tokens.map((t) => normalize(t.text));

    for (let i = 0; i <= norms.length - words.length; i++) {
      let ok = true;
      for (let j = 0; j < words.length; j++) {
        const n = norms[i + j];
        const w = words[j];
        if (n === w) continue;
        // Allow token to CONTAIN the word (handles a single OCR token holding
        // multiple text segments). Do NOT allow word to contain token —
        // otherwise single-char tokens like "1" or "j" would match any value
        // containing those characters.
        if (n.length >= 2 && n.includes(w)) continue;
        if (w.length >= 4 && n.length >= 3 && w.includes(n)) continue;
        ok = false;
        break;
      }
      if (ok) {
        return tokens.slice(i, i + words.length);
      }
    }
  }
  return [];
}

function bboxForValue(value: string, pages: DocAiPage[]): BBox | null {
  const matched = findTokenRun(value, pages);
  if (matched.length === 0) return null;
  return unionBboxes(matched.map((t) => t.bbox));
}

// For each extracted field, search the OCR tokens for the field's value and
// attach a bbox. Skips:
//   - null values
//   - tables (each cell would need its own anchor; not worth the complexity for MVP)
// For arrays (lists), grounds against the first item — good enough for the
// hover-to-page-jump UX.
export function groundFieldsWithTokens(
  fields: ExtractedField[],
  pages: DocAiPage[],
): ExtractedField[] {
  if (pages.length === 0) return fields;

  return fields.map((f): ExtractedField => {
    if (f.value === null || f.value === undefined) return f;

    // For text/longtext: ground against value (truncated to first 6 words —
    // long passages are unlikely to match contiguously verbatim).
    if (typeof f.value === "string") {
      const truncated = f.value.split(/\s+/).slice(0, 6).join(" ");
      const bbox = bboxForValue(truncated, pages);
      return { ...f, bbox };
    }

    // Array of strings (list) → ground against the first item.
    if (Array.isArray(f.value) && f.value.length > 0 && typeof f.value[0] === "string") {
      const first = (f.value as string[])[0];
      const bbox = bboxForValue(first, pages);
      return { ...f, bbox };
    }

    // Table (array of objects) → ground against the first non-empty cell value.
    if (Array.isArray(f.value) && f.value.length > 0 && typeof f.value[0] === "object") {
      const rows = f.value as TableRow[];
      const firstNonEmpty = rows
        .flatMap((r) => Object.values(r))
        .find((v) => v && v.trim().length > 0);
      if (!firstNonEmpty) return f;
      const bbox = bboxForValue(firstNonEmpty, pages);
      return { ...f, bbox };
    }

    return f;
  });
}

export type { DocAiPage }; // re-export for callers
