// End-to-end test for the 3-branch ensemble extraction pipeline.
//
// Runs each sample PDF in /files through:
//   Doc AI OCR → [structurer | OpenAI vision | Claude vision] (parallel) → reconciler → bbox grounding
// Prints per-file: branch success/failure, reconciled fields, disagreement count.
//
// Usage: npx tsx scripts/test-pipeline.ts [file.pdf ...]

import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import { ocrDocument } from "../lib/docai";
import { structureMarkdown } from "../lib/docai-structurer";
import { extractWithOpenAI } from "../lib/openai-extractor";
import { extractWithAnthropic } from "../lib/anthropic-extractor";
import { reconcile, type BranchResult } from "../lib/reconciler";
import { groundFieldsWithTokens } from "../lib/bbox-grounding";
import type { ExtractedField, FieldValue } from "../lib/types";

const FILES_DIR = path.resolve(__dirname, "../files");

const argv = process.argv.slice(2);
// 07 is the blank Service Request Form template (the destination form),
// not a source document — exclude from the default sweep.
const targets = argv.length > 0
  ? argv.map((a) => (path.isAbsolute(a) ? a : path.join(FILES_DIR, a)))
  : fs.readdirSync(FILES_DIR)
      .filter((f) => f.endsWith(".pdf") && f !== "07-service-request-form.pdf")
      .map((f) => path.join(FILES_DIR, f));

function fmtValue(v: FieldValue): string {
  if (v === null) return "∅";
  if (typeof v === "string") return v.length > 60 ? v.slice(0, 60) + "…" : v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (typeof v[0] === "string") return JSON.stringify(v);
    return `[${v.length} rows]`;
  }
  return JSON.stringify(v);
}

async function runOne(pdfPath: string) {
  const name = path.basename(pdfPath);
  console.log("\n" + "=".repeat(80));
  console.log(`📄 ${name}`);
  console.log("=".repeat(80));

  const pdfBytes = fs.readFileSync(pdfPath);
  console.log(`PDF size: ${(pdfBytes.length / 1024).toFixed(1)} KB`);

  const t0 = Date.now();
  let ocr;
  try {
    ocr = await ocrDocument(pdfBytes);
    console.log(`✓ Doc AI OCR: ${ocr.pages.length} pages, ${ocr.pages.reduce((s, p) => s + p.tokens.length, 0)} tokens (${Date.now() - t0}ms)`);
  } catch (e) {
    console.log(`✗ Doc AI OCR failed: ${(e as Error).message}`);
    return;
  }

  const t1 = Date.now();
  const [structRes, openaiRes, anthroRes] = await Promise.allSettled([
    structureMarkdown(ocr.fullMarkdown),
    extractWithOpenAI(pdfBytes),
    extractWithAnthropic(pdfBytes),
  ]);
  const branchMs = Date.now() - t1;

  const branches: BranchResult[] = [];
  if (structRes.status === "fulfilled") {
    branches.push({ name: "docai", fields: structRes.value.fields });
    console.log(`✓ Doc AI structurer (GPT-5 mini)`);
  } else {
    console.log(`✗ Doc AI structurer: ${(structRes.reason as Error).message}`);
  }
  if (openaiRes.status === "fulfilled") {
    branches.push({ name: "openai", fields: openaiRes.value.fields });
    console.log(`✓ OpenAI vision (GPT-4o)`);
  } else {
    console.log(`✗ OpenAI vision: ${(openaiRes.reason as Error).message}`);
  }
  if (anthroRes.status === "fulfilled") {
    branches.push({ name: "anthropic", fields: anthroRes.value.fields });
    console.log(`✓ Claude vision (Sonnet 4.5)`);
  } else {
    console.log(`✗ Claude vision: ${(anthroRes.reason as Error).message}`);
  }
  console.log(`Branches parallel: ${branchMs}ms`);

  if (branches.length === 0) {
    console.log("All branches failed.");
    return;
  }

  const { fields, meta } = reconcile(branches);
  const grounded: ExtractedField[] = groundFieldsWithTokens(fields, ocr.pages);

  const nonNull = grounded.filter((f) => f.value !== null);
  const withBbox = nonNull.filter((f) => f.bbox !== null).length;
  const agreementAll = meta.filter((m) => m.agreement === "all").length;
  const agreementMaj = meta.filter((m) => m.agreement === "majority").length;
  const agreementSingle = meta.filter((m) => m.agreement === "single").length;
  const agreementNone = meta.filter((m) => m.agreement === "none").length;

  console.log(`\nReconciliation:`);
  console.log(`  all agree:       ${agreementAll}`);
  console.log(`  majority (2/3):  ${agreementMaj}`);
  console.log(`  only one branch: ${agreementSingle}`);
  console.log(`  no agreement:    ${agreementNone}`);
  console.log(`Extracted: ${nonNull.length} fields (${withBbox} with bbox)`);

  console.log(`\nFields:`);
  for (const f of grounded) {
    if (f.value === null) continue;
    const m = meta.find((x) => x.field === f.name);
    const tag = m?.agreement === "all"
      ? "✓✓✓"
      : m?.agreement === "majority"
      ? "✓✓·"
      : m?.agreement === "none"
      ? "⚠⚠⚠"
      : "·";
    console.log(`  [${tag}] ${f.name}: ${fmtValue(f.value)}`);
  }

  const disagreements = meta.filter((m) => m.agreement === "none");
  if (disagreements.length > 0) {
    console.log(`\nDisagreements (showing votes):`);
    for (const d of disagreements) {
      console.log(`  ${d.field}:`);
      for (const v of d.votes) {
        console.log(`    [${v.branch}] (conf=${v.confidence ?? "?"}) ${fmtValue(v.value)}`);
      }
    }
  }
}

(async () => {
  for (const t of targets) {
    try {
      await runOne(t);
    } catch (e) {
      console.error(`Fatal on ${t}: ${(e as Error).message}`);
    }
  }
})();
