// Inspect the latest extraction for a given document — shows what each
// branch produced for the fields the user asked about (medications,
// presenting_symptoms, history, treatment_goals).

import * as path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const docId = process.argv[2] ?? "ed627570-990d-487e-a76a-b9b26c36e72d";

const FIELDS = [
  "clinical.medications",
  "clinical.presenting_symptoms",
  "clinical.history",
  "clinical.treatment_goals",
  "member.member_id",
  "requesting_provider.name",
];

(async () => {
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("extractions")
    .select("id, created_at, raw_extractor_response, extracted_fields")
    .eq("document_id", docId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.error("No extraction found:", error?.message);
    process.exit(1);
  }

  const raw = data.raw_extractor_response as {
    branches?: Record<string, { fields?: Array<{ name: string; value: unknown; confidence: unknown; source_quote: unknown }> }>;
    reconciliation?: Array<{ field: string; agreement: string; winner: string | null; votes: Array<{ branch: string; value: unknown; confidence: unknown }> }>;
    markdown?: string;
  };

  console.log(`Extraction ${data.id} (${data.created_at})`);
  console.log("\n=== Doc AI markdown ===\n");
  console.log(raw.markdown ?? "(no markdown)");
  console.log("\n=== Per-branch field outputs ===\n");

  for (const fieldName of FIELDS) {
    console.log(`\n--- ${fieldName} ---`);
    for (const branch of ["docai", "openai", "anthropic"]) {
      const fields = raw.branches?.[branch]?.fields ?? [];
      const f = fields.find((x) => x.name === fieldName);
      if (!f) {
        console.log(`  [${branch}] (no entry)`);
        continue;
      }
      const v = f.value == null ? "∅" : JSON.stringify(f.value);
      console.log(`  [${branch}] conf=${f.confidence ?? "?"} value=${v}`);
      if (f.source_quote) console.log(`             quote="${String(f.source_quote).slice(0, 120)}"`);
    }
    const meta = raw.reconciliation?.find((m) => m.field === fieldName);
    if (meta) {
      console.log(`  → reconciler: agreement=${meta.agreement}, winner=${meta.winner}`);
    }
  }
})();
