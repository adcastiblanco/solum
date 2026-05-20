# Test cases — beyond the happy path

The 5 sample PDFs (02–06) cover the happy path: clean, English-language, well-formed clinical documents. This catalog adds **adversarial / edge cases** that exercise specific failure modes of the pipeline.

## Running

```bash
# Regenerate from source (lives in scripts/generate-edge-cases.ts)
npx tsx scripts/generate-edge-cases.ts

# Smoke-test through the full pipeline (no DB writes)
npx tsx scripts/test-pipeline.ts files/edge-cases/E01-pizza-menu.pdf

# Or upload via the dashboard and inspect in the UI.
```

All PDFs land in `files/edge-cases/`. Generation is deterministic — same input scripts → same byte-identical PDFs.

---

## The catalog

| ID | Name | Stresses | Expected behavior |
|---|---|---|---|
| **E01** | `E01-pizza-menu.pdf` | **Out-of-domain document.** A restaurant menu — nothing clinical. | Nearly all fields **null**. Any non-null value is a hallucination — track it. The "Suggested" chip path is the only acceptable surface for stray model proposals (single non-docai → suppressed). Zero values for ICD-10 / CPT / NPI. |
| **E02** | `E02-blank-form.pdf` | **Empty document.** A single grey line "Clinic intake — please bring this completed form…" and otherwise blank. | All fields **null**. Tests over-eager extractors that fabricate from nothing. Expect `all -> null` on every field. |
| **E03** | `E03-abbreviated-cardiology-note.pdf` | **Heavy clinical shorthand.** `c/o`, `f/u`, `s/p`, `h/o`, `RRR`, `m/r/g`, `CTAB`, `2+ b/l`. | Member ID = `BCH-22910`, ICD-10 = `I25.10, E11.65, I10`, medications table with ASA / atorvastatin / metoprolol / metformin / empagliflozin. `presenting_symptoms` should map "c/o intermittent SOB on exertion" correctly. `clinical.history` captures "s/p CABG '19" and "A1c was 7.6 on 12/04/25". `treatment_goals` carries the A/P list. |
| **E04** | `E04-spanish-psych-note.pdf` | **Non-English source.** Spanish narrative, English schema. Tests cross-lingual semantic mapping. | Patient name = `Maria Soledad Cabrera Vela`, DOB = `22/11/1988`, member ID = `BCBS-MX-9920-441`. ICD-10 = `F33.1`. Current PHQ-9 row = `16 / 15/02/2026`. Prior PHQ-9 (22 on 15/01/2026) belongs in `clinical.history`, NOT in assessments. Medications table captures sertralina + trazodona. **Open question** the test answers: does the schema-trained ensemble understand "Motivo de consulta" = presenting_symptoms? |
| **E05** | `E05-dual-patient-prior-auth.pdf` | **Two people on one document.** Patient (Aiden, child) vs. subscriber (Lauren, parent). | `member.*` should describe the **patient** (Aiden Cole Pereira, DOB 04/02/2018, Male). The subscriber's name and DOB are **distractors** — must not leak into `member.first_name` etc. Member ID and group # are *on the policy* so they're correct from the subscriber row. Provider = Dr. Anand Krishnan. Diagnosis = F90.0. |
| **E06** | `E06-long-medication-list.pdf` | **Long medications table** — 10 rows including multiple prescribers, dose units (mg / mcg / IU), and OTC. | All 10 rows captured in `clinical.medications`. Bbox grounding emits one bbox per row (10 total). Prescriber column populated for each (not blank). |
| **E07** | `E07-multipage-hp.pdf` | **3-page H&P.** Tests multi-page OCR, bbox page numbers, and that ICD-10 codes on pages 2-3 are still extracted. | 6 ICD-10 codes captured (`I50.21, I11.0, E11.65, E78.5, G47.33, N17.9`). `clinical.history` includes 15-year HTN, prior MI 2018. `treatment_goals` has the full Plan list. Bboxes for items on pages 2 and 3 should carry `page: 2` / `page: 3` correctly. |
| **E08** | `E08-date-format-ambiguity.pdf` | **Mixed date formats.** Same document uses `11.03.1990`, `03/11/2026`, `14/12/2025`. | The schema's instruction is "preserve exact spelling from source" — so DOB stays `11.03.1990` (not "normalized" to `11/03/1990` or `1990-11-03`). Tests prompt adherence to verbatim rule. |

---

## What to look for, run-by-run

When you smoke-test these, the manifestation of a **good run**:

1. **E01 / E02**: extraction completes with 0–1 non-null fields. The reconciler page shows nearly all rows as `all agree (null)`. No fabricated NPI, no fabricated ICD-10.
2. **E03**: the abbreviation-heavy note produces 25+ non-null fields with most at `all` or `majority` agreement. The `clinical.medications` table has 5 rows.
3. **E04**: the Spanish note produces a populated form. Watch for **partial Spanish→English translation drift** in the value strings — the prompt says preserve verbatim, so "Trastorno depresivo mayor" should not become "Major Depressive Disorder" on its own.
4. **E05**: `member.first_name` is "Aiden", not "Lauren". If it's "Lauren", the model collapsed patient and subscriber — failure.
5. **E06**: `clinical.medications` has 10 rows. If it has fewer, the model truncated.
6. **E07**: page 2/3 bboxes for diagnoses; ICD-10 list of 6.
7. **E08**: DOB string equals what's on the page, not a re-formatted version.

## Failure modes this corpus is designed to surface

| Failure mode | Caught by |
|---|---|
| Hallucinated patient data on irrelevant docs | E01, E02 |
| Hallucinating from nothing | E02 |
| Failing on clinical shorthand | E03 |
| Brittleness on non-English input | E04 |
| Confusing subscriber/patient on dual-subject docs | E05 |
| Silently truncating long tables | E06 |
| Losing fields on later pages | E07 |
| Auto-normalizing values that should be verbatim | E08, E04 |
| Misclassifying past vs. present vs. future content | E03 (A1c was 7.6 on 12/04/25), E04 (PHQ-9 22 on 15/01) |

## Adding new cases

`scripts/generate-edge-cases.ts` is one function per case. To add:

1. Add a new `async function eXX_my_case() { ... }` using `newDoc()` + the `makeWriter` helper.
2. Call it from the bottom IIFE.
3. Append a row to the table above explaining what it stresses and the expected behavior.
4. Re-run `npx tsx scripts/generate-edge-cases.ts`.

## Real-world corpora worth considering

When ground truth from synthetic PDFs hits its ceiling, these public sources are the next stop (all de-identified):

- **MIMIC-IV-Note** (free for credentialed researchers, MIT) — ICU discharge summaries / progress notes / radiology reports.
- **NIH Chest X-ray reports** — short radiology reports with structured findings.
- **MTSamples** (mtsamples.com) — public transcribed medical reports by specialty.
- **i2b2 NLP shared tasks** — annotated clinical text datasets, often with gold labels for de-identification, medication extraction, etc.

These come with the consent/licensing constraints typical of clinical data; for a hand-curated ground truth set, an internal pass with a clinician annotator on 30–50 docs is more valuable than scraping a public corpus.
