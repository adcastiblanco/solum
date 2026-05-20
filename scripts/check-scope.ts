// Quick check that out-of-scope detection works. Runs the 3 branches against
// a target PDF and prints each branch's is_medical_document verdict + the
// reconciler's final decision.

import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import { ocrDocument } from "../lib/docai";
import { structureMarkdown } from "../lib/docai-structurer";
import { extractWithOpenAI } from "../lib/openai-extractor";
import { extractWithAnthropic } from "../lib/anthropic-extractor";
import { reconcile, type BranchResult } from "../lib/reconciler";

(async () => {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: tsx scripts/check-scope.ts <pdf-path>");
    process.exit(1);
  }
  const bytes = fs.readFileSync(target);
  const ocr = await ocrDocument(bytes);
  const [d, o, a] = await Promise.all([
    structureMarkdown(ocr.fullMarkdown),
    extractWithOpenAI(bytes),
    extractWithAnthropic(bytes),
  ]);
  console.log(`\n${path.basename(target)}\n`);
  for (const [name, r] of [["docai", d], ["openai", o], ["anthropic", a]] as const) {
    console.log(`  [${name.padEnd(9)}] is_medical=${r.isMedicalDocument} reason=${r.outOfScopeReason ?? "—"}`);
  }
  const branches: BranchResult[] = [
    { name: "docai", fields: d.fields, isMedicalDocument: d.isMedicalDocument, outOfScopeReason: d.outOfScopeReason },
    { name: "openai", fields: o.fields, isMedicalDocument: o.isMedicalDocument, outOfScopeReason: o.outOfScopeReason },
    { name: "anthropic", fields: a.fields, isMedicalDocument: a.isMedicalDocument, outOfScopeReason: a.outOfScopeReason },
  ];
  const result = reconcile(branches);
  console.log(`\n  reconciler.outOfScope.isOutOfScope = ${result.outOfScope.isOutOfScope}`);
  console.log(`  reconciler.outOfScope.reason       = ${result.outOfScope.reason ?? "—"}`);
  const nonNull = result.fields.filter((f) => f.value !== null).length;
  console.log(`  non-null fields after reconcile    = ${nonNull}`);
})();
