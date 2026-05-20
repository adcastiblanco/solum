// Field-level reconciler. Takes ExtractedField[] from each of the three
// branches and produces a single reconciled ExtractedField[] by majority
// vote, with disagreement annotated on the source_quote field for the UI to
// surface.
//
// Normalization is type-aware:
//   - text/longtext: lowercase, collapse whitespace, strip punctuation,
//     then exact match. For longtext we also fall back to a Jaccard-on-
//     word-tokens similarity so paraphrases count as similar.
//   - list: compared as sets of normalized strings.
//   - table: rows aligned by the table's first column (key column), then
//     each cell voted independently within aligned rows.
//
// When 2-of-3 agree → that value wins (and we copy the confidence /
// source_quote from a winning branch).
// When 0-of-3 agree → pick the value with the highest individual confidence
// and tag the field as disagreement so the UI can flag it.

import { EXTRACTABLE_FIELDS, FIELD_DEFS, type ExtractedField, type FieldValue, type TableRow } from "./types";
import type { ExtractorName } from "./types";

export type BranchResult = {
  name: ExtractorName;
  fields: ExtractedField[];
  isMedicalDocument?: boolean;
  outOfScopeReason?: string | null;
};

export type OutOfScopeVerdict = {
  isOutOfScope: boolean;
  // Per-branch votes — kept for transparency in the UI and for debugging.
  votes: Array<{ branch: ExtractorName; isMedicalDocument: boolean; reason: string | null }>;
  // Best one-line reason among the branches that voted "not medical".
  reason: string | null;
};

export type ReconciliationMeta = {
  field: string;
  agreement: "all" | "majority" | "none" | "single"; // single = only one branch had a value
  winner: ExtractorName | null; // which branch's value we kept
  votes: Array<{ branch: ExtractorName; value: FieldValue; confidence: number | null }>;
};

export type ReconciledOutput = {
  fields: ExtractedField[];
  meta: ReconciliationMeta[];
  outOfScope: OutOfScopeVerdict;
};

// ---------- normalization ----------

function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),:;'"\.\-\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordTokens(s: string): string[] {
  return normText(s).split(/\s+/).filter((t) => t.length > 0);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Type-specific equality. Returns true if two values "agree enough" to count
// as the same vote. Exported so the eval harness can reuse the same
// normalization the reconciler uses.
export function valuesAgree(fieldName: string, a: FieldValue, b: FieldValue): boolean {
  // Both null → agree (both branches said "not present").
  if (a === null && b === null) return true;
  // One null, the other not → disagree.
  if (a === null || b === null) return false;

  const def = FIELD_DEFS[fieldName];
  if (!def) return false;

  switch (def.type) {
    case "text": {
      if (typeof a !== "string" || typeof b !== "string") return false;
      return normText(a) === normText(b);
    }
    case "longtext": {
      if (typeof a !== "string" || typeof b !== "string") return false;
      if (normText(a) === normText(b)) return true;
      // Paraphrase tolerance: Jaccard ≥ 0.6 on word tokens.
      return jaccard(wordTokens(a), wordTokens(b)) >= 0.6;
    }
    case "list": {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      const A = new Set((a as string[]).map(normText));
      const B = new Set((b as string[]).map(normText));
      if (A.size === 0 && B.size === 0) return true;
      // Symmetric difference ≤ 1 element OR Jaccard ≥ 0.8.
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      const union = A.size + B.size - inter;
      if (union === 0) return true;
      return inter / union >= 0.8;
    }
    case "table": {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      return tablesAgree(def.columns?.[0]?.key ?? "", a as TableRow[], b as TableRow[]);
    }
  }
}

function tablesAgree(keyCol: string, a: TableRow[], b: TableRow[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (!keyCol) return JSON.stringify(a) === JSON.stringify(b);
  const keyOf = (r: TableRow) => normText(r[keyCol] ?? "");
  const aKeys = new Set(a.map(keyOf).filter((k) => k.length > 0));
  const bKeys = new Set(b.map(keyOf).filter((k) => k.length > 0));
  if (aKeys.size === 0 && bKeys.size === 0) return true;
  let inter = 0;
  for (const k of aKeys) if (bKeys.has(k)) inter++;
  const union = aKeys.size + bKeys.size - inter;
  return union > 0 && inter / union >= 0.6;
}

// ---------- vote ----------

// Group n candidates by mutual agreement (transitively). Returns the largest
// cluster (and its members' indices). With n=3 this is trivial — just check
// pairs.
function findMajorityCluster(
  fieldName: string,
  values: FieldValue[],
): { indices: number[] } {
  const n = values.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (valuesAgree(fieldName, values[i], values[j])) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  // Connected components.
  const seen = new Array(n).fill(false);
  let best: number[] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const stack = [i];
    const comp: number[] = [];
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (seen[x]) continue;
      seen[x] = true;
      comp.push(x);
      for (const y of adj[x]) if (!seen[y]) stack.push(y);
    }
    if (comp.length > best.length) best = comp;
  }
  return { indices: best };
}

// For table fields with majority agreement, merge rows from the agreeing
// branches: union of keys, with cell values voted per column. Falls back to
// the first agreeing branch's table if anything goes sideways.
function mergeTableRows(
  keyCol: string,
  cols: string[],
  branches: TableRow[][],
): TableRow[] {
  if (branches.length === 0) return [];
  if (!keyCol) return branches[0];
  // Collect all keys from any branch.
  const keyToRows = new Map<string, TableRow[]>();
  for (const tbl of branches) {
    for (const row of tbl) {
      const k = normText(row[keyCol] ?? "");
      if (!k) continue;
      const arr = keyToRows.get(k) ?? [];
      arr.push(row);
      keyToRows.set(k, arr);
    }
  }
  const merged: TableRow[] = [];
  for (const [, rows] of keyToRows) {
    // Skip rows that only appear in one branch when we have 3 branches and 2+
    // agreed — preserves the union but biases toward consensus.
    if (rows.length < Math.min(2, branches.length)) continue;
    const out: TableRow = {};
    for (const c of cols) {
      // Per-cell majority among the agreeing rows. Empty string is a valid
      // value; we still tally it but break ties by picking the longest
      // non-empty string.
      const tally = new Map<string, number>();
      for (const r of rows) {
        const v = (r[c] ?? "").trim();
        tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      let bestVal = "";
      let bestCount = -1;
      for (const [v, count] of tally) {
        if (count > bestCount || (count === bestCount && v.length > bestVal.length)) {
          bestCount = count;
          bestVal = v;
        }
      }
      out[c] = bestVal;
    }
    merged.push(out);
  }
  if (merged.length === 0) return branches[0]; // safety net
  return merged;
}

// ---------- main ----------

export function reconcile(branches: BranchResult[]): ReconciledOutput {
  // First, ask the simpler question: does this document belong here at all?
  // Branches that explicitly flagged is_medical_document=false count as
  // "out of scope" votes. A branch that didn't address the question (legacy
  // prompt / missing field) abstains. We treat the document as out of scope
  // when at least half of the branches that voted said "no" AND at least
  // one branch voted no — i.e. majority-of-voters with a floor.
  const scopeVotes = branches
    .filter((b) => typeof b.isMedicalDocument === "boolean")
    .map((b) => ({
      branch: b.name,
      isMedicalDocument: b.isMedicalDocument as boolean,
      reason: b.outOfScopeReason ?? null,
    }));
  const noVotes = scopeVotes.filter((v) => !v.isMedicalDocument);
  const yesVotes = scopeVotes.filter((v) => v.isMedicalDocument);
  const isOutOfScope = noVotes.length > 0 && noVotes.length >= yesVotes.length;

  if (isOutOfScope) {
    return {
      fields: EXTRACTABLE_FIELDS.map((name) => ({
        name,
        value: null,
        confidence: null,
        bbox: null,
        source_quote: null,
      })),
      meta: [],
      outOfScope: {
        isOutOfScope: true,
        votes: scopeVotes,
        reason: noVotes[0]?.reason ?? null,
      },
    };
  }

  // Index branches by name for quick lookup.
  const byName = new Map<ExtractorName, ExtractedField[]>();
  for (const b of branches) byName.set(b.name, b.fields);

  const meta: ReconciliationMeta[] = [];

  const reconciled: ExtractedField[] = EXTRACTABLE_FIELDS.map((fieldName): ExtractedField => {
    const def = FIELD_DEFS[fieldName];
    const candidates = branches.map((b) => {
      const f = b.fields.find((x) => x.name === fieldName);
      return {
        name: b.name,
        field: f ?? { name: fieldName, value: null, confidence: null, bbox: null, source_quote: null },
      };
    });

    const votes = candidates.map((c) => ({
      branch: c.name,
      value: c.field.value,
      confidence: c.field.confidence,
    }));

    // If everyone says null → null with full agreement.
    const allNull = candidates.every((c) => c.field.value === null);
    if (allNull) {
      meta.push({ field: fieldName, agreement: "all", winner: null, votes });
      return { name: fieldName, value: null, confidence: null, bbox: null, source_quote: null };
    }

    const values = candidates.map((c) => c.field.value);
    const cluster = findMajorityCluster(fieldName, values);

    // Filter cluster to non-null members for table merging and quote
    // selection (null members "agree" with each other but shouldn't drive
    // the chosen value).
    const nonNullInCluster = cluster.indices.filter((i) => candidates[i].field.value !== null);

    if (nonNullInCluster.length >= 2) {
      // Majority (or unanimous) cluster of agreeing non-null values.
      const winners = nonNullInCluster.map((i) => candidates[i]);
      // Doc AI is the source of truth — its OCR is grounded in the actual
      // document text. Model confidence scores are unreliable (LLMs
      // overconfide), so we prefer Doc AI when it's part of the agreeing
      // cluster, regardless of reported confidence.
      const docaiWinner = winners.find((w) => w.name === "docai");
      let chosen = docaiWinner ?? winners[0];
      if (!docaiWinner) {
        for (const w of winners) {
          if ((w.field.confidence ?? 0) > (chosen.field.confidence ?? 0)) chosen = w;
        }
      }

      let value: FieldValue = chosen.field.value;
      if (def.type === "table" && Array.isArray(chosen.field.value)) {
        const tables = winners
          .map((w) => w.field.value)
          .filter((v): v is TableRow[] => Array.isArray(v) && v.length > 0 && typeof v[0] === "object");
        const cols = (def.columns ?? []).map((c) => c.key);
        const keyCol = cols[0] ?? "";
        value = mergeTableRows(keyCol, cols, tables);
      }

      const agreement = nonNullInCluster.length === candidates.filter((c) => c.field.value !== null).length
        ? "all"
        : "majority";
      meta.push({ field: fieldName, agreement: agreement as "all" | "majority", winner: chosen.name, votes });

      return {
        name: fieldName,
        value,
        confidence: chosen.field.confidence,
        bbox: null,
        source_quote: chosen.field.source_quote,
      };
    }

    // No agreement among non-null values (or only one branch had a value).
    const nonNull = candidates.filter((c) => c.field.value !== null);
    if (nonNull.length === 1) {
      const only = nonNull[0];
      meta.push({ field: fieldName, agreement: "single", winner: only.name, votes });
      // Doc AI is the only branch we trust unilaterally. If the lone vote
      // came from a vision model (openai / anthropic), suppress the value
      // and leave it null — the reconciliation meta still records the
      // proposal so the UI can show a soft hint that the reviewer can
      // accept manually.
      if (only.name !== "docai") {
        return { name: fieldName, value: null, confidence: null, bbox: null, source_quote: null };
      }
      return {
        name: fieldName,
        value: only.field.value,
        confidence: only.field.confidence,
        bbox: null,
        source_quote: only.field.source_quote,
      };
    }

    // No agreeing cluster among non-null values. If Doc AI is in the
    // non-null set, use its value (source of truth). If Doc AI is null and
    // the vision branches disagree, return null — we have no grounded
    // signal, and picking either by confidence risks accepting a
    // hallucination (LLMs overconfide). The meta still records all votes
    // so the UI can offer the proposals as suggestions.
    const docai = nonNull.find((c) => c.name === "docai");
    meta.push({
      field: fieldName,
      agreement: "none",
      winner: docai?.name ?? null,
      votes,
    });
    if (docai) {
      return {
        name: fieldName,
        value: docai.field.value,
        confidence: docai.field.confidence,
        bbox: null,
        source_quote: docai.field.source_quote,
      };
    }
    return { name: fieldName, value: null, confidence: null, bbox: null, source_quote: null };
  });

  // Silence unused-name warning if a branch contributed nothing.
  byName.clear();

  return {
    fields: reconciled,
    meta,
    outOfScope: { isOutOfScope: false, votes: scopeVotes, reason: null },
  };
}
