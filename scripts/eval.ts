// Offline eval harness for the 3-branch ensemble.
//
// Two modes:
//
//   npx tsx scripts/eval.ts --generate
//     For each PDF in /files that does NOT yet have a ground-truth JSON,
//     ask Claude Sonnet 4.5 to extract the schema with extra care (longer
//     output budget, "be conservative — null when unsure" instruction) and
//     write the result to scripts/eval/ground-truth/<basename>.json.
//     These files are meant to be hand-reviewed afterwards.
//
//   npx tsx scripts/eval.ts                (default)
//     For each ground-truth file, run the full pipeline (docai / openai /
//     anthropic) + reconciliation against the PDF and print a per-field,
//     per-branch accuracy table. Uses the SAME normalization the reconciler
//     uses (valuesAgree), so "correct" here means "would have voted with
//     ground truth in the ensemble".
//
// Output:
//   - Markdown table to stdout
//   - Same markdown saved under scripts/eval/results/<ISO-timestamp>.md
//
// Caveat: ground truth is LLM-generated, not human-curated. Treat the
// numbers as relative (which branch wins per field) rather than absolute.
// The point is to detect systematic per-field weakness so we can route or
// fine-tune — exactly the feedback loop the README describes.

import * as fs from "node:fs";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import Anthropic from "@anthropic-ai/sdk";
import { ocrDocument } from "../lib/docai";
import { structureMarkdown } from "../lib/docai-structurer";
import { extractWithOpenAI } from "../lib/openai-extractor";
import { extractWithAnthropic } from "../lib/anthropic-extractor";
import { reconcile, valuesAgree, type BranchResult } from "../lib/reconciler";
import { EXTRACTABLE_FIELDS, FIELD_DEFS, type ExtractedField, type FieldValue } from "../lib/types";
import { SYSTEM_PROMPT_BASE, userInstruction, stripCodeFences, normalizeBranchFields } from "../lib/extractor-shared";

const FILES_DIR = path.resolve(__dirname, "../files");
const GT_DIR = path.resolve(__dirname, "eval/ground-truth");
const RESULTS_DIR = path.resolve(__dirname, "eval/results");

type BranchName = "docai" | "openai" | "anthropic" | "reconciled";
const BRANCHES: BranchName[] = ["docai", "openai", "anthropic", "reconciled"];

// ---------- ground-truth generation ----------

async function generateGroundTruth(pdfPath: string): Promise<ExtractedField[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const client = new Anthropic({ apiKey });

  const pdfBytes = fs.readFileSync(pdfPath);
  const base64 = pdfBytes.toString("base64");

  const systemPrompt =
    SYSTEM_PROMPT_BASE +
    "\n\nYou are producing a GROUND-TRUTH reference. Take extra care:\n" +
    "- Re-read the document twice before committing a value.\n" +
    "- Return null when you are not 100% certain — a missing value is better than a wrong one.\n" +
    "- For lists/tables, only include items you can quote verbatim from the source.\n" +
    "- Never invent values to look helpful.";

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16384,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          { type: "text", text: userInstruction() },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = JSON.parse(stripCodeFences(text));
  return normalizeBranchFields(parsed);
}

async function cmdGenerate(targets: string[]) {
  fs.mkdirSync(GT_DIR, { recursive: true });
  for (const pdfPath of targets) {
    const base = path.basename(pdfPath, ".pdf");
    const outPath = path.join(GT_DIR, `${base}.json`);
    if (fs.existsSync(outPath)) {
      console.log(`[skip] ${base} (ground truth exists)`);
      continue;
    }
    process.stdout.write(`[gen ] ${base} ... `);
    try {
      const fields = await generateGroundTruth(pdfPath);
      fs.writeFileSync(outPath, JSON.stringify(fields, null, 2) + "\n");
      console.log(`✓ ${fields.length} fields → ${path.relative(process.cwd(), outPath)}`);
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`);
    }
  }
  console.log(
    "\nGround-truth files written. Open them and correct any obvious errors before running the eval.",
  );
}

// ---------- eval ----------

type FieldScore = Record<BranchName, { correct: number; total: number }>;

function emptyScore(): FieldScore {
  const s = {} as FieldScore;
  for (const b of BRANCHES) s[b] = { correct: 0, total: 0 };
  return s;
}

function fieldsByName(fields: ExtractedField[]): Map<string, FieldValue> {
  const m = new Map<string, FieldValue>();
  for (const f of fields) m.set(f.name, f.value);
  return m;
}

async function evalOne(
  pdfPath: string,
  gt: ExtractedField[],
): Promise<{
  perField: Map<string, Record<BranchName, "correct" | "wrong" | "missing">>;
  perBranchTotal: FieldScore;
}> {
  const pdfBytes = fs.readFileSync(pdfPath);

  const ocr = await ocrDocument(pdfBytes);
  const [structRes, openaiRes, anthroRes] = await Promise.allSettled([
    structureMarkdown(ocr.fullMarkdown),
    extractWithOpenAI(pdfBytes),
    extractWithAnthropic(pdfBytes),
  ]);

  const branches: BranchResult[] = [];
  const byBranch: Partial<Record<BranchName, Map<string, FieldValue>>> = {};
  if (structRes.status === "fulfilled") {
    branches.push({ name: "docai", fields: structRes.value.fields });
    byBranch.docai = fieldsByName(structRes.value.fields);
  }
  if (openaiRes.status === "fulfilled") {
    branches.push({ name: "openai", fields: openaiRes.value.fields });
    byBranch.openai = fieldsByName(openaiRes.value.fields);
  }
  if (anthroRes.status === "fulfilled") {
    branches.push({ name: "anthropic", fields: anthroRes.value.fields });
    byBranch.anthropic = fieldsByName(anthroRes.value.fields);
  }
  const reconciled = reconcile(branches);
  byBranch.reconciled = fieldsByName(reconciled.fields);

  const gtMap = fieldsByName(gt);

  const perField = new Map<string, Record<BranchName, "correct" | "wrong" | "missing">>();
  const perBranchTotal = emptyScore();

  for (const fieldName of EXTRACTABLE_FIELDS) {
    const gtValue = gtMap.get(fieldName) ?? null;
    const row: Record<BranchName, "correct" | "wrong" | "missing"> = {} as never;
    for (const b of BRANCHES) {
      const bMap = byBranch[b];
      if (!bMap) {
        row[b] = "missing";
        continue;
      }
      const v = bMap.get(fieldName) ?? null;
      const agree = valuesAgree(fieldName, gtValue, v);
      row[b] = agree ? "correct" : "wrong";
      perBranchTotal[b].total += 1;
      if (agree) perBranchTotal[b].correct += 1;
    }
    perField.set(fieldName, row);
  }

  return { perField, perBranchTotal };
}

function pct(c: number, t: number): string {
  if (t === 0) return "—";
  return `${((c / t) * 100).toFixed(0)}%`;
}

function symbol(state: "correct" | "wrong" | "missing"): string {
  if (state === "correct") return "✓";
  if (state === "wrong") return "✗";
  return "·";
}

async function cmdRun() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (!fs.existsSync(GT_DIR)) {
    console.error(
      `No ground-truth directory at ${GT_DIR}.\nRun: npx tsx scripts/eval.ts --generate`,
    );
    process.exit(1);
  }
  const gtFiles = fs.readdirSync(GT_DIR).filter((f) => f.endsWith(".json"));
  if (gtFiles.length === 0) {
    console.error(`No ground-truth files in ${GT_DIR}.\nRun: npx tsx scripts/eval.ts --generate`);
    process.exit(1);
  }

  const lines: string[] = [];
  const push = (s: string) => {
    console.log(s);
    lines.push(s);
  };

  push(`# Eval results — ${new Date().toISOString()}\n`);

  const overall = emptyScore();
  const perFieldAgg = new Map<string, FieldScore>();

  for (const gtFile of gtFiles.sort()) {
    const base = path.basename(gtFile, ".json");
    const pdfPath = path.join(FILES_DIR, `${base}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      push(`\n_skip ${base}: PDF not found at ${pdfPath}_\n`);
      continue;
    }
    const gt = JSON.parse(fs.readFileSync(path.join(GT_DIR, gtFile), "utf8")) as ExtractedField[];

    push(`\n## ${base}\n`);
    const t0 = Date.now();
    let result;
    try {
      result = await evalOne(pdfPath, gt);
    } catch (e) {
      push(`_failed: ${(e as Error).message}_`);
      continue;
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    push(`| Branch | Correct | Total | Accuracy |`);
    push(`|---|---:|---:|---:|`);
    for (const b of BRANCHES) {
      const s = result.perBranchTotal[b];
      push(`| ${b} | ${s.correct} | ${s.total} | ${pct(s.correct, s.total)} |`);
      overall[b].correct += s.correct;
      overall[b].total += s.total;
    }
    push(`\n_elapsed: ${elapsed}s_`);

    push(`\n<details><summary>Per-field breakdown</summary>\n`);
    push(`| Field | docai | openai | anthropic | reconciled |`);
    push(`|---|:-:|:-:|:-:|:-:|`);
    for (const fieldName of EXTRACTABLE_FIELDS) {
      const row = result.perField.get(fieldName)!;
      push(
        `| \`${fieldName}\` | ${symbol(row.docai)} | ${symbol(row.openai)} | ${symbol(row.anthropic)} | ${symbol(row.reconciled)} |`,
      );
      const agg = perFieldAgg.get(fieldName) ?? emptyScore();
      for (const b of BRANCHES) {
        agg[b].total += 1;
        if (row[b] === "correct") agg[b].correct += 1;
      }
      perFieldAgg.set(fieldName, agg);
    }
    push(`\n</details>`);
  }

  push(`\n## Overall\n`);
  push(`| Branch | Correct | Total | Accuracy |`);
  push(`|---|---:|---:|---:|`);
  for (const b of BRANCHES) {
    const s = overall[b];
    push(`| **${b}** | ${s.correct} | ${s.total} | **${pct(s.correct, s.total)}** |`);
  }

  push(`\n## Where each branch wins (and loses)\n`);
  push(`Fields where the ensemble materially beats every soloist, and fields where a single branch dominates, are the candidates for **routing** and **fine-tuning** (see README → Feedback loop).\n`);
  push(`| Field | docai | openai | anthropic | reconciled |`);
  push(`|---|:-:|:-:|:-:|:-:|`);
  for (const [fieldName, agg] of perFieldAgg) {
    push(
      `| \`${fieldName}\` | ${pct(agg.docai.correct, agg.docai.total)} | ${pct(agg.openai.correct, agg.openai.total)} | ${pct(agg.anthropic.correct, agg.anthropic.total)} | ${pct(agg.reconciled.correct, agg.reconciled.total)} |`,
    );
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(RESULTS_DIR, `${ts}.md`);
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`\nResults saved → ${path.relative(process.cwd(), outPath)}`);
}

// ---------- main ----------

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage:
  npx tsx scripts/eval.ts --generate           Generate ground truth for any sample PDF that doesn't have one yet
  npx tsx scripts/eval.ts --generate <pdf>...  Generate for specific PDFs only
  npx tsx scripts/eval.ts                      Run eval against existing ground truth
`);
    return;
  }
  if (argv.includes("--generate")) {
    const explicit = argv.filter((a) => !a.startsWith("--"));
    const targets =
      explicit.length > 0
        ? explicit.map((a) => (path.isAbsolute(a) ? a : path.join(FILES_DIR, a)))
        : fs
            .readdirSync(FILES_DIR)
            .filter((f) => f.endsWith(".pdf") && f !== "07-service-request-form.pdf")
            .map((f) => path.join(FILES_DIR, f));
    await cmdGenerate(targets);
    return;
  }
  await cmdRun();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
