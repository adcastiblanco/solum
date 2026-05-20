import * as path from "node:path";
import * as fs from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

import { ocrDocument } from "../lib/docai";
import { structureMarkdown } from "../lib/docai-structurer";
import { extractWithAnthropic } from "../lib/anthropic-extractor";
import { extractWithOpenAI } from "../lib/openai-extractor";

(async () => {
  const pdfPath = process.argv[2] ?? path.resolve(__dirname, "../files/06-handwritten-clinical-note.pdf");
  const pdf = fs.readFileSync(pdfPath);
  const ocr = await ocrDocument(pdf);
  const [docai, openai, anthropic] = await Promise.all([
    structureMarkdown(ocr.fullMarkdown),
    extractWithOpenAI(pdf),
    extractWithAnthropic(pdf),
  ]);

  for (const [name, res] of [["docai", docai], ["openai", openai], ["anthropic", anthropic]] as const) {
    const f = res.fields.find((x) => x.name === "clinical.assessments");
    console.log(name, JSON.stringify(f?.value));
  }
})();
