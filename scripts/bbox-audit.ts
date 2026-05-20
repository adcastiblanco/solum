// Audit bbox coverage across the most recent extraction of every sample doc.
// For each field with a non-null value, report whether bbox / bboxes exist
// and whether the bbox is suspicious (e.g. zero-area, off-page).

import * as path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import type { BBox, ExtractedField } from "../lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 07 is the empty Service Request Form template (the target form), not a
// source document — excluded.
const SAMPLE_NAMES = [
  "02-referral-letter",
  "03-insurance-card",
  "04-lab-results",
  "05-patient-intake-form",
  "06-handwritten-clinical-note",
];

function isSuspect(b: BBox): string | null {
  if (b.width <= 0 || b.height <= 0) return "zero-area";
  if (b.x < 0 || b.y < 0) return "negative-origin";
  if (b.x + b.width > 1.001 || b.y + b.height > 1.001) return "off-page";
  if (b.width < 0.01 && b.height < 0.01) return "tiny";
  return null;
}

(async () => {
  const sb = createClient(url, key);
  let totalNonNull = 0, totalWithBbox = 0, totalWithBboxes = 0, totalSuspect = 0;

  for (const name of SAMPLE_NAMES) {
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
      .select("extracted_fields")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ext) continue;
    const fields = (ext.extracted_fields ?? []) as ExtractedField[];

    console.log(`\n=== ${doc.file_name} ===`);
    for (const f of fields) {
      if (f.value === null) continue;
      totalNonNull++;
      const hasBbox = !!f.bbox;
      const bboxes = (f.bboxes ?? []) as BBox[];
      const numBboxes = bboxes.length;
      if (hasBbox) totalWithBbox++;
      if (numBboxes > 0) totalWithBboxes++;
      const suspectReasons: string[] = [];
      for (const b of bboxes) {
        const s = isSuspect(b);
        if (s) suspectReasons.push(s);
      }
      if (f.bbox) {
        const s = isSuspect(f.bbox);
        if (s) suspectReasons.push(`single:${s}`);
      }
      if (suspectReasons.length > 0) totalSuspect++;

      const tag =
        !hasBbox && numBboxes === 0
          ? "✗ NO BBOX"
          : suspectReasons.length > 0
            ? `⚠ ${suspectReasons.join(",")}`
            : `✓ ${numBboxes}box${numBboxes === 1 ? "" : "es"}`;
      const valueStr = typeof f.value === "string" ? f.value.slice(0, 40) : `[${typeof f.value === "object" && Array.isArray(f.value) ? f.value.length : "?"} items]`;
      console.log(`  ${tag.padEnd(20)} ${f.name.padEnd(40)} ${valueStr}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Non-null fields: ${totalNonNull}`);
  console.log(`With single bbox: ${totalWithBbox} (${((totalWithBbox / totalNonNull) * 100).toFixed(0)}%)`);
  console.log(`With bboxes[] >= 1: ${totalWithBboxes} (${((totalWithBboxes / totalNonNull) * 100).toFixed(0)}%)`);
  console.log(`Suspect (zero-area / off-page): ${totalSuspect}`);
})();
