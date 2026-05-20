// Debug bbox grounding failures: for fields that got no bbox, dump the
// source_quote from the winning branch + the first chunk of Doc AI markdown
// so we can see what the value contains vs what the doc actually has.

import * as path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import type { ExtractedField } from "../lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

(async () => {
  const sb = createClient(url, key);

  const targets: [string, string][] = [
    ["02-referral-letter", "clinical.treatment_goals"],
    ["05-patient-intake-form", "clinical.presenting_symptoms"],
    ["06-handwritten-clinical-note", "any"],
  ];

  for (const [name, field] of targets) {
    const { data: doc } = await sb
      .from("documents")
      .select("id, file_name")
      .ilike("file_name", `%${name}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!doc) continue;
    const { data: ext } = await sb
      .from("extractions")
      .select("extracted_fields, raw_extractor_response")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ext) continue;

    const fields = (ext.extracted_fields ?? []) as ExtractedField[];
    const raw = ext.raw_extractor_response as {
      branches?: Record<string, { fields?: Array<{ name: string; value: unknown; source_quote: unknown }> }>;
      markdown?: string;
    };

    console.log(`\n=== ${doc.file_name} ===`);
    if (field === "any") {
      const noBboxFields = fields.filter((f) => f.value !== null && !f.bbox && (!f.bboxes || f.bboxes.length === 0));
      console.log(`No-bbox fields: ${noBboxFields.length}`);
      for (const f of noBboxFields) {
        console.log(`  - ${f.name}: ${JSON.stringify(f.value).slice(0, 80)}`);
      }
    } else {
      const f = fields.find((x) => x.name === field);
      console.log(`Value: ${JSON.stringify(f?.value)}`);
      for (const branch of ["docai", "openai", "anthropic"]) {
        const bf = raw.branches?.[branch]?.fields?.find((x) => x.name === field);
        console.log(`  [${branch}] source_quote: ${JSON.stringify(bf?.source_quote)?.slice(0, 200)}`);
      }
      console.log(`\nDoc markdown (first 800 chars):`);
      console.log(raw.markdown?.slice(0, 800));
    }
  }
})();
