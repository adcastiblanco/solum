// Inspect the latest extraction for a document and report:
//   - which fields have bbox=null vs not
//   - per-field branch outputs and reconciler decision
//   - candidates for hallucination (single-branch non-docai with confident value)

import * as path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const docName = process.argv[2] ?? "handwritten";

(async () => {
  const sb = createClient(url, key);

  const { data: doc } = await sb
    .from("documents")
    .select("id, file_name")
    .ilike("file_name", `%${docName}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) {
    console.error("No document matched");
    process.exit(1);
  }
  console.log(`Document: ${doc.file_name} (${doc.id})`);

  const { data: ext } = await sb
    .from("extractions")
    .select("id, created_at, raw_extractor_response, extracted_fields")
    .eq("document_id", doc.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ext) {
    console.error("No extraction");
    process.exit(1);
  }
  console.log(`Extraction: ${ext.id} (${ext.created_at})\n`);

  const fields = (ext.extracted_fields ?? []) as Array<{
    name: string;
    value: unknown;
    confidence: number | null;
    bbox: unknown;
    source_quote?: string | null;
  }>;
  const raw = ext.raw_extractor_response as {
    branches?: Record<string, { fields?: Array<{ name: string; value: unknown; confidence: unknown }> }>;
    reconciliation?: Array<{ field: string; agreement: string; winner: string | null; votes: Array<{ branch: string; value: unknown; confidence: unknown }> }>;
  };

  console.log("=== Final fields (with bbox status) ===");
  for (const f of fields) {
    if (f.value === null) continue;
    const v = typeof f.value === "string" ? f.value : JSON.stringify(f.value);
    const bbox = f.bbox ? "✓" : "✗";
    const meta = raw.reconciliation?.find((m) => m.field === f.name);
    const tag = meta ? `[${meta.agreement} -> ${meta.winner}]` : "";
    console.log(`  bbox=${bbox}  ${f.name.padEnd(40)} ${tag.padEnd(28)} ${String(v).slice(0, 60)}`);
  }

  console.log("\n=== Single-branch fields (potential hallucinations) ===");
  for (const m of raw.reconciliation ?? []) {
    if (m.agreement !== "single") continue;
    console.log(`  ${m.field.padEnd(40)} winner=${m.winner}`);
    for (const v of m.votes) {
      if (v.value === null || v.value === undefined) continue;
      const s = typeof v.value === "string" ? v.value : JSON.stringify(v.value);
      console.log(`    [${v.branch}] conf=${v.confidence ?? "?"} value=${String(s).slice(0, 80)}`);
    }
  }

  console.log("\n=== Disagreements (3 different values) ===");
  for (const m of raw.reconciliation ?? []) {
    if (m.agreement !== "none") continue;
    console.log(`  ${m.field.padEnd(40)} winner=${m.winner}`);
    for (const v of m.votes) {
      const s = v.value === null ? "∅" : (typeof v.value === "string" ? v.value : JSON.stringify(v.value));
      console.log(`    [${v.branch}] conf=${v.confidence ?? "?"} value=${String(s).slice(0, 80)}`);
    }
  }
})();
