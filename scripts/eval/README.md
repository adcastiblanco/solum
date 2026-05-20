# Offline eval harness

Measures per-field, per-branch accuracy on the sample PDFs, using the same `valuesAgree` normalization the production reconciler uses.

## Workflow

```bash
# 1. Generate ground truth (one-shot, careful Claude Sonnet 4.5 call per sample).
#    Writes scripts/eval/ground-truth/<basename>.json — review/correct by hand afterwards.
npx tsx scripts/eval.ts --generate

# 2. Run the eval. Runs the full 3-branch pipeline + reconciler against each PDF
#    that has a ground-truth file, and produces a markdown report.
npx tsx scripts/eval.ts
```

Each run writes a timestamped report to `scripts/eval/results/<iso>.md`.

## What the report shows

- **Per-document accuracy** by branch (`docai` / `openai` / `anthropic` / `reconciled`).
- **Per-field × per-branch breakdown** (✓/✗/·) — so you can spot a branch that's systematically wrong on a single field.
- **Overall accuracy** across all samples.
- **Where each branch wins** — the table that feeds the routing / fine-tuning roadmap described in `README.md → Feedback loop`.

## Caveats

Ground truth is **LLM-generated, not human-curated**. Use the numbers comparatively (which branch wins on which field) rather than as an absolute accuracy claim. The point is to detect systematic per-field weakness, which is exactly the signal the routing / fine-tuning roadmap needs.

For a publishable accuracy number, replace the JSONs in `ground-truth/` with hand-curated values.

## Adding a new sample

1. Drop the PDF into `files/`.
2. `npx tsx scripts/eval.ts --generate <new-file>.pdf`
3. Open `scripts/eval/ground-truth/<new-file>.json`, fix what's wrong.
4. `npx tsx scripts/eval.ts`
