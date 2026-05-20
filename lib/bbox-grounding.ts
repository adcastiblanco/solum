import type { DocAiPage, DocAiToken } from "./docai";
import { FIELD_DEFS, type BBox, type ExtractedField, type TableRow } from "./types";

// Normalize a string for token matching: lowercase, strip punctuation that
// OCR may split inconsistently. We're matching against the Doc AI token
// stream, which typically splits on whitespace AND on hyphens / slashes /
// dots — so an ID like "ANT-XK7829014" arrives as ["ANT", "-", "XK7829014"]
// (or further-split). Stripping these separators from both sides puts the
// candidate value and the token text on equal footing.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),:;'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Two passes:
//   1. Whitespace-only split — Doc AI often keeps short composite tokens
//      ("2/5/26", "12/17/83") as a single token. Whitespace split matches
//      those directly.
//   2. Punctuation split — for IDs Doc AI typically fragments on hyphens
//      ("ANT-XK7829014" → ["ANT", "XK7829014"]). Punctuation split lets
//      the run-finder align them.
// findTokenRun tries both, in this order — whichever matches first wins.
function tokenizeWhitespace(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function tokenizeWithPunct(value: string): string[] {
  return normalize(value)
    .split(/[\s\-‐-―\/\\=()\[\]{}#]+/)
    .filter((t) => t.length > 0);
}

function tokenizationsToTry(value: string): string[][] {
  const ws = tokenizeWhitespace(value);
  const punct = tokenizeWithPunct(value);
  if (ws.length === punct.length && ws.every((t, i) => t === punct[i])) return [ws];
  // Try the more granular tokenization first. For "ANT-XK7829014" it yields
  // ["ant", "xk7829014"] which can align across separate Doc AI tokens; the
  // coarser ["ant-xk7829014"] would substring-match just the "ANT" token and
  // miss the rest. Whitespace-only is the fallback for values Doc AI kept
  // as a single composite token (e.g. "2/5/26").
  return [punct, ws];
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

function isSeparatorOnly(s: string): boolean {
  return s.length === 0 || /^[^a-z0-9]+$/.test(s);
}

function matchWords(
  words: string[],
  tokens: DocAiToken[],
  norms: string[],
): DocAiToken[] {
  for (let i = 0; i < norms.length; i++) {
    if (isSeparatorOnly(norms[i])) continue;
    let j = 0;
    let k = i;
    let endIdx = i;
    while (k < norms.length && j < words.length) {
      const n = norms[k];
      if (isSeparatorOnly(n)) {
        k++;
        continue;
      }
      const w = words[j];
      const ok =
        n === w ||
        (n.length >= 2 && n.includes(w)) ||
        (w.length >= 4 && n.length >= 3 && w.includes(n));
      if (!ok) break;
      endIdx = k;
      j++;
      k++;
    }
    if (j === words.length) return tokens.slice(i, endIdx + 1);
  }
  return [];
}

// Try whitespace-only first ("2/5/26" stays one token, matches Doc AI's
// composite token). Fall back to punctuation-split if no match
// ("ANT-XK7829014" → ["ANT", "XK7829014"] when Doc AI fragments on hyphens).
function findTokenRun(needle: string, pages: DocAiPage[]): DocAiToken[] {
  for (const words of tokenizationsToTry(needle)) {
    if (words.length === 0) continue;
    for (const page of pages) {
      const norms = page.tokens.map((t) => normalize(t.text));
      const found = matchWords(words, page.tokens, norms);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function bboxForValue(value: string, pages: DocAiPage[]): BBox | null {
  const matched = findTokenRun(value, pages);
  if (matched.length === 0) return null;
  return unionBboxes(matched.map((t) => t.bbox));
}

// Union of bboxes ignoring page mismatches — picks the best page like
// unionBboxes does but flat. Used to combine the per-phrase bboxes of a
// longtext into a single fallback rectangle.
function unionBboxesAcrossPages(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  // Pick the page with the most boxes.
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
  return unionBboxes(byPage.get(bestPage)!);
}

// Split a longtext value into the phrases the model likely lifted from
// distinct regions of the source (sentences / clauses separated by `.`,
// `;`, or line breaks). Each phrase is then grounded individually.
function splitIntoPhrases(value: string): string[] {
  return value
    .split(/[.;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

// Ground a longtext value by trying each constituent phrase. Returns the
// list of bboxes for phrases that successfully aligned to a Doc AI token
// run. Phrases that didn't match are skipped silently.
function groundLongtext(value: string, pages: DocAiPage[]): BBox[] {
  const phrases = splitIntoPhrases(value);
  const out: BBox[] = [];
  for (const phrase of phrases) {
    // First try the full phrase; if it fails, truncate to the first 6 words
    // (paraphrased restatements often have a verbatim opening fragment).
    let b = bboxForValue(phrase, pages);
    if (!b) {
      const head = phrase.split(/\s+/).slice(0, 6).join(" ");
      if (head !== phrase) b = bboxForValue(head, pages);
    }
    if (b) out.push(b);
  }
  return out;
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

    if (typeof f.value === "string") {
      const def = FIELD_DEFS[f.name];
      if (def?.type === "longtext") {
        // Prefer source_quote (verbatim from the source) over value (which
        // the model often paraphrases for longtext). When source_quote
        // doesn't ground, fall back to the value itself.
        const quote = typeof f.source_quote === "string" ? f.source_quote : null;
        let bboxes: BBox[] = [];
        if (quote && quote.trim().length > 0) bboxes = groundLongtext(quote, pages);
        if (bboxes.length === 0) bboxes = groundLongtext(f.value, pages);
        if (bboxes.length === 0) return { ...f, bbox: null, bboxes: [] };
        return { ...f, bbox: unionBboxesAcrossPages(bboxes), bboxes };
      }
      // Short text: single contiguous run, truncate to first 6 words.
      const truncated = f.value.split(/\s+/).slice(0, 6).join(" ");
      const bbox = bboxForValue(truncated, pages);
      return { ...f, bbox, bboxes: bbox ? [bbox] : [] };
    }

    // List (array of strings): ground every item; bbox is the union, bboxes
    // is the per-item list so the UI can highlight each item separately.
    if (Array.isArray(f.value) && f.value.length > 0 && typeof f.value[0] === "string") {
      const items = f.value as string[];
      const bboxes: BBox[] = [];
      for (const item of items) {
        const b = bboxForValue(item, pages);
        if (b) bboxes.push(b);
      }
      return { ...f, bbox: unionBboxesAcrossPages(bboxes), bboxes };
    }

    // Table (array of objects) → ground the first non-empty cell of each row.
    if (Array.isArray(f.value) && f.value.length > 0 && typeof f.value[0] === "object") {
      const rows = f.value as TableRow[];
      const bboxes: BBox[] = [];
      for (const row of rows) {
        const firstCell = Object.values(row).find((v) => v && v.trim().length > 0);
        if (!firstCell) continue;
        const b = bboxForValue(firstCell, pages);
        if (b) bboxes.push(b);
      }
      return { ...f, bbox: unionBboxesAcrossPages(bboxes), bboxes };
    }

    return f;
  });
}

export type { DocAiPage }; // re-export for callers
