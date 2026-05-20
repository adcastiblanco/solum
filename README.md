# Solum Health — Document AI MVP

> Submission for the Solum Health technical challenge.
> A web app that ingests heterogeneous clinical documents (clean PDFs, scanned faxes, handwritten notes, insurance cards, lab reports), extracts structured data with a **three-model ensemble**, auto-fills the *Service Request Form*, and lets a human review/correct each field with the source PDF anchored next to it.

**Live demo:** _add Vercel URL here_
**Walkthrough (Loom):** _add link here_

---

## TL;DR

- **Upload** PDFs or images (PNG / JPG / WebP / GIF / BMP / TIFF) — same pipeline for both.
- Three extractors run in parallel against the same JSON schema (Doc 07):
  - **Google Document AI** → OCR + per-token bounding boxes → **GPT-5 mini** structurer
  - **OpenAI GPT-4o** vision over the raw file
  - **Anthropic Claude Sonnet 4.5** vision over the raw file
- A **reconciler** votes per field with **Doc AI as the source of truth**. 2-of-3 agreement wins; lone vision proposals are *suppressed but surfaced* as soft suggestions so hallucinations don't slip in. Genuine disagreements are flagged, never hidden.
- A **bbox grounding** step anchors each winning value back to Doc AI tokens (one bbox per phrase for longtext), so the review UI can highlight the exact regions on hover.
- The review UI shows confidence, multi-region highlights, edit state (`was_edited`), and approval state. Edits are persisted and feed an **accuracy dashboard**.
- **Live progress per document**: the pipeline writes `documents.phase` (1 OCR → 2 ensemble → 3 reconcile/ground/persist) and the dashboard renders a 3-wedge ring per row with the active wedge softly pulsing. Once the third phase finishes the row flips to `status='done'` and the ring is replaced by a `DONE` badge — "done" is the terminal status, not a fourth phase.
- **Out-of-scope detection**: each branch first classifies whether the doc is clinical at all. If a majority says no (a menu, a contract, marketing material), the pipeline returns zero fields and the review page shows a banner — no hallucinated patient data on irrelevant files.

> 📐 **Full architecture diagrams + DB schema + file layout:** see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## How it maps to the challenge

| Challenge requirement | Where it lives |
|---|---|
| 1. Extract structured data from messy docs | `lib/docai.ts`, `lib/openai-extractor.ts`, `lib/anthropic-extractor.ts` |
| 2. Auto-fill the *Request for Approval of Services* form (Doc 07) | Schema in `lib/types.ts` (`FORM_SECTIONS`) drives prompts + UI |
| 3. Handle confidence / ambiguity | `lib/reconciler.ts` emits per-field `agreement` (`all` / `majority` / `none` / `single`); UI flags disagreements and low-confidence fields |
| 4. Track accuracy | `field_reviews` table records `was_edited` per field; `/accuracy` page aggregates correction rate by field |

---

## Architecture

```mermaid
flowchart LR
    U[User]
    U -->|upload PDF| W[Next.js App Router]

    subgraph Vercel["Vercel · Next.js 16 / React 19"]
      W --> UPL[POST /api/documents]
      W --> EXT[POST /api/extract]
      W --> REV[UI /review/:id]
      W --> ACC[UI /accuracy]
    end

    UPL --> SB[(Supabase\nPostgres + RLS\n+ Storage bucket)]
    EXT --> SB

    subgraph Pipeline["Extraction pipeline (Node runtime, maxDuration=300s)"]
      EXT --> DOCAI[Google Document AI\nOCR + tokens + bboxes]
      EXT --> GPT[OpenAI GPT-4o\nvision on PDF]
      EXT --> CLA[Anthropic Claude Sonnet 4.5\nvision on PDF]
      DOCAI --> STR[GPT-5 mini\nmarkdown structurer]
      STR --> REC[Reconciler · per-field vote]
      GPT --> REC
      CLA --> REC
      REC --> GRD[BBox grounding\nvs Doc AI tokens]
      GRD --> SB
    end

    REV --> SB
    REV -->|PDF + bbox overlay| U
    ACC --> SB
```

Three independent extractor branches produce the **same `ExtractedField[]` shape**. Only Doc AI emits reliable per-token bounding boxes, so the reconciler picks the winning value and a later grounding step finds that value in Doc AI's tokens to anchor it visually on the PDF.

---

## Extraction pipeline in detail

```mermaid
sequenceDiagram
    autonumber
    participant UI as Review UI
    participant API as /api/extract
    participant Sup as Supabase Storage
    participant D as Doc AI
    participant O as OpenAI GPT-4o
    participant A as Claude Sonnet 4.5
    participant S as GPT-4o-mini structurer
    participant R as Reconciler

    UI->>API: POST { documentId }
    API->>Sup: signed URL (10 min)
    Sup-->>API: PDF bytes
    API->>D: OCR (tokens + markdown)
    D-->>API: pages[], fullMarkdown
    par three branches in parallel
        API->>S: structureMarkdown(fullMarkdown) [GPT-5 mini]
        S-->>API: ExtractedField[]
    and
        API->>O: extractWithOpenAI(pdfBytes)
        O-->>API: ExtractedField[]
    and
        API->>A: extractWithAnthropic(pdfBytes)
        A-->>API: ExtractedField[]
    end
    API->>R: reconcile([docai, openai, anthropic])
    R-->>API: winning fields + meta (votes, agreement)
    API->>API: groundFieldsWithTokens(fields, docai.pages)
    API->>Sup: INSERT extractions
    API-->>UI: { extractionId, fields, reconciliation }
```

### Out-of-scope detection (embedded, no extra inference)

The classifier is **part of each branch's existing prompt**, not a separate upfront call. Each model returns a top-level `is_medical_document: boolean` alongside the schema fields, in the same response. The reconciler then votes on scope before it votes on field values:

```
For each branch (Doc AI structurer / OpenAI / Claude) in one call:
  → classify: is this a clinical / insurance / medical document?
  → if YES: extract the 30 fields
  → if NO:  return { is_medical_document: false, fields: {} } + a one-line reason
```

The reconciler treats the document as out of scope when **at least half of the branches that voted said "not medical" AND at least one branch voted no** — i.e. majority-of-voters with a floor. When that triggers, every field is forced to null, grounding is skipped, and the review page shows an amber banner instead of the form.

**Why embedded vs. a separate upfront classifier call:**

- **No extra latency or cost** on the common case (real clinical docs) — the classification piggybacks on a call we were going to make anyway.
- **Three independent votes** vs one. A single upfront classifier that misjudges would silently kill extraction on a real document. The 3-vote scheme tolerates one branch being overly strict (we saw this in testing — a blank intake form got one "no" and two "yes", and the pipeline correctly proceeded).
- **Trade-off:** when a doc *is* out of scope, the 3 branches still ran (to classify), so the negative case costs the same as the positive case. If production sees a high rate of non-clinical uploads, the next optimization is a cheap upfront short-circuit (e.g., Claude Haiku 4.5 with a 1-token yes/no answer ~50 ms / ~$0.0001) that skips the 3 expensive branches when it's clearly off-topic.

### Reconciliation rules (`lib/reconciler.ts`)

Doc AI is the source of truth — its OCR is anchored in real document text. LLM-reported confidence is treated as unreliable (LLMs overconfide), so ties don't break on the confidence number.

- **All 3 agree** → that value wins.
- **2-of-3 agree** → that value wins; Doc AI is preferred winner if it's in the cluster.
- **Single branch has a value, it's Doc AI** → keep it (Doc AI is trusted unilaterally).
- **Single branch has a value, it's OpenAI or Claude** → **suppress the value**, but record the proposal in meta so the UI shows a soft `Suggested` hint the reviewer can manually accept. Prevents lone hallucinations from being persisted.
- **All 3 disagree, Doc AI has a value** → Doc AI wins, tagged `disagreement` so the UI flags it.
- **All 3 disagree, Doc AI is null** → return null. Picking by LLM confidence here risks accepting a hallucination.

**Type-aware normalization** per field:

- `text` / `longtext`: lowercase + collapse whitespace + strip punctuation; `longtext` also falls back to Jaccard similarity over word tokens, so paraphrases count as agreement.
- `list`: compared as sets of normalized strings.
- `table`: rows aligned by the first column (key), then each cell voted independently.

### BBox grounding (`lib/bbox-grounding.ts`)

General-purpose vision LLMs are unreliable at coordinates. Doc AI is reliable. So we decouple **"what value is correct"** (ensemble) from **"where is it on the page"** (Doc AI tokens). After reconciliation, each winning value is searched against Doc AI's tokens to synthesize the bboxes the review UI overlays.

Two refinements that matter in practice:

- For **longtext** the matcher prefers the model's `source_quote` (verbatim citation) over the `value` (which may be paraphrased). It splits the quote into phrases and grounds each separately, yielding multiple bboxes that highlight every region of the document the value was assembled from.
- For **IDs with internal punctuation** (`ANT-XK7829014`), the tokenizer splits on hyphens first to align with Doc AI's tokens, falling back to whitespace-only for composite tokens like `2/5/26` that Doc AI kept whole.

---

## Data model

```mermaid
erDiagram
    documents ||--o{ extractions : "1..n"
    extractions ||--o{ field_reviews : "1..n per field"
    auth_users ||--o{ documents : "owns (RLS)"

    documents {
      uuid id PK
      uuid user_id FK
      text file_name
      text storage_path
      text status "pending|processing|done|error"
      smallint phase "0..3 — sub-step within processing"
      text error_message
      timestamptz created_at
    }
    extractions {
      uuid id PK
      uuid document_id FK
      jsonb raw_extractor_response "ocr, branches, reconciliation"
      jsonb extracted_fields "ExtractedField[] grounded"
      timestamptz created_at
    }
    field_reviews {
      uuid id PK
      uuid extraction_id FK
      text field_name
      text original_value
      text final_value
      bool was_edited
      bool approved
      numeric confidence
      jsonb bbox
      timestamptz reviewed_at
    }
```

**Row Level Security** is enforced on every table against `auth.uid()`. Storage objects follow the `userId/...` convention so a user can never read or write data they don't own — even by manipulating IDs in the client.

---

## AI tools used (and how)

The challenge brief explicitly asks for an honest breakdown. Here it is:

| Tool | Role |
|---|---|
| **Google Document AI** | Authoritative OCR — provides per-token text + bounding boxes. Single source of truth for *where* a value is on the page. |
| **OpenAI GPT-4o** (vision) | Independent extractor — reads the PDF as images, returns the schema directly. Best on clean typed and structured documents. |
| **Anthropic Claude Sonnet 4.5** (vision) | Independent extractor — same input, different model family. Useful as a tiebreaker, and in our tests it handles handwritten/messy docs (Doc 06) better than GPT-4o alone. |
| **GPT-4o-mini** | Cheap structurer — turns Doc AI's markdown into the same `ExtractedField[]` schema so the OCR branch can vote alongside the vision branches. |
| **Claude Code** | Used to build the project itself — pipeline scaffolding, schema generation from the *Service Request Form*, reconciliation logic, this README. |
| **Cursor / GitHub Copilot** | Inline edits, prompt iteration. |

The design intent is that **adding a fourth extractor (Gemini, Mistral OCR, etc.) is a 30-line change** in `/api/extract` — every branch returns `ExtractorResult`, the reconciler is provider-agnostic.

---

## Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4 | Matches Solum's stack; App Router gives one project for UI + API. |
| OCR + token bboxes | Google Document AI | Reliable coordinates that visual LLMs don't provide. |
| Vision extraction | OpenAI GPT-4o + Claude Sonnet 4.5 | Two independent vendors → real ensemble diversity. |
| Auth + DB + Storage | Supabase (Postgres + RLS + private bucket) | Matches Solum's stack; RLS replaces a permissions layer. |
| PDF rendering | `react-pdf` | Client-side rendering so bbox overlays line up exactly. |
| Deploy | Vercel (Node runtime, `maxDuration = 300`) | Same target as Solum. |

I did **not** use Prisma — Supabase's typed client + raw SQL migrations were enough for an MVP and saved an ORM layer.

---

## Repo layout

```
app/
  (app)/                 # Authenticated routes
    dashboard/           # User's documents
    review/[documentId]/ # PDF + sidebar with editable fields + bbox overlay
    accuracy/            # Field-level correction rate (was_edited %)
  (auth)/                # Supabase SSR login/signup
  api/
    documents/           # Upload + list
    extract/             # Pipeline orchestration (see above)
    review/              # Persist field_reviews

lib/
  docai.ts               # Google Document AI client
  docai-structurer.ts    # Markdown → ExtractedField[] via GPT-4o-mini
  openai-extractor.ts    # GPT-4o vision over PDF
  anthropic-extractor.ts # Claude Sonnet 4.5 vision over PDF
  reconciler.ts          # Per-field voting, type-aware
  bbox-grounding.ts      # Anchor values to Doc AI tokens
  extractor-shared.ts    # Shared prompt + schema validation
  types.ts               # FORM_SECTIONS (Doc 07 schema), ExtractedField
  supabase/              # SSR + browser clients

supabase/migrations/     # Versioned schema (RLS, storage policies)
scripts/test-pipeline.ts # Run the 3-branch pipeline against a local PDF
docs/                    # RFC, mockup, sample documents (01–07)
```

---

## Running it locally

```bash
# 1. Install
npm install

# 2. Env vars (see .env.local.example)
#    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#    OPENAI_API_KEY
#    ANTHROPIC_API_KEY
#    GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json
#    DOCAI_PROCESSOR_ID, DOCAI_LOCATION
cp .env.local.example .env.local

# 3. Apply migrations (Supabase CLI)
#    supabase link --project-ref <your-project-ref>
#    supabase db push
#    # (or, against a local stack: `supabase start && supabase db reset`)

# 4. Run
npm run dev
# → http://localhost:3000
```

To smoke-test the pipeline headlessly: `scripts/test-pipeline.ts` runs all three branches against a local PDF and prints the reconciliation table.

### Offline eval

A reproducible eval harness lives under `scripts/eval/`:

```bash
# Generate LLM ground truth once (careful Claude Sonnet 4.5 pass per sample).
# Writes scripts/eval/ground-truth/*.json — hand-review and correct afterwards.
npm run eval:generate

# Run the eval: full pipeline vs ground truth, per-field × per-branch accuracy.
# Writes a markdown report to scripts/eval/results/<iso>.md.
npm run eval
```

The report shows per-document, per-branch, and per-field accuracy, plus a final table of *where each branch wins* — which is the signal the routing / fine-tuning roadmap depends on. Ground truth is LLM-generated, so treat the numbers as comparative ("branch X loses on field Y"), not absolute. See `scripts/eval/README.md`.

---

## Key technical decisions (and trade-offs)

1. **Ensemble over single-model.** A single vision LLM on these documents hallucinates dates, member IDs, and CPT codes silently. Three independent branches turn silent errors into visible disagreements. **Cost:** 3× the per-doc API spend. **Worth it** because the human-in-the-loop signal (`disagreement`) is what makes the tool trustworthy.

2. **Disagreement as a first-class citizen.** The reconciler never tries to look confident when models conflict. The UI shows the field with the highest individual confidence but flags it — instead of pretending we know.

3. **BBox grounding decoupled from extraction.** Vision LLMs are unreliable at coordinates. Doc AI is reliable. Decoupling lets each side improve independently.

4. **Declarative schema (`FORM_SECTIONS`).** The form (Doc 07) is encoded once in `lib/types.ts` and drives prompts, reconciliation, validation, and UI. Changing a field is a single edit.

5. **RLS before app-layer auth.** Authorization lives in Postgres, not handlers. Endpoints can't forget to filter by `user_id` — the database refuses.

6. **Failure isolation with `Promise.allSettled`.** If one provider is down, extraction degrades (2 branches instead of 3) but doesn't break. The error is persisted alongside the extraction for debugging.

7. **Sync request, not a queue (MVP).** Vercel `maxDuration = 300s` is enough for the 6 sample docs. Production would replace this with a queue + SSE/WebSocket updates — see roadmap.

8. **Single-request multi-page (MVP).** The sample documents fit in one request: Doc AI's sync endpoint handles ~15 pages, and both vision branches accept the full PDF within their token limits. Clinical documents in this domain (progress notes, referrals, lab reports, intake forms) are typically under 10 pages, so this covers the realistic case. For long H&Ps or discharge summaries (>20 pages) the pipeline would need page-level chunking with a merge step in the reconciler — out of scope for the MVP.

9. **No Prisma.** The Supabase typed client + raw SQL migrations covered everything an ORM would, with one fewer abstraction to debug.

---

## Feedback loop — from ensemble to a single trusted model

The current architecture is intentionally over-engineered for accuracy: three independent extractors per document. That's the right call **right now**, when we have no ground truth and no signal about which model is best for which kind of field. But every approval and every correction the user makes in the review UI is *labeled data* — and the schema is already capturing it:

```mermaid
flowchart LR
    R[Review UI] -->|edit / approve| FR[(field_reviews)]
    FR --> AGG[Aggregate per\nfield × branch]
    AGG --> DASH[/accuracy page/]
    AGG --> DEC{Branch wins\nconsistently?}
    DEC -->|yes| ROUTE[Route field to\nsingle branch]
    DEC -->|no| KEEP[Keep ensemble\nfor this field]
    ROUTE --> FT[Future:\nfine-tune the winner\non field_reviews dataset]
```

Concretely, `field_reviews` already stores `original_value`, `final_value`, `was_edited`, and `approved` per field. Cross-referencing each row with `extractions.raw_extractor_response.branches` (which keeps each branch's individual answer) gives us **per-field, per-branch accuracy** out of the box.

The roadmap that data unlocks:

1. **Per-field routing.** Once a field shows e.g. >95% accuracy on a single branch over N documents, drop the other branches *for that field*. We pay 1× the API cost on safe fields and keep 3× only on the ambiguous ones.
2. **Confidence calibration.** Use `was_edited` as the binary label and train a small calibrator (logistic regression / gradient boost) on model-reported confidence + agreement + field type. The output is a real *probability the user will edit this field* — that's the signal the UI should show, not raw model confidence.
3. **Fine-tuning the winner.** Once a single model is the clear winner on a class of documents (clean typed notes, lab reports, handwritten…), the corrected `final_value` pairs become a fine-tuning dataset. Fine-tune the winner; retire the ensemble on that class.
4. **Active learning on disagreements.** When the three branches disagree, the corrected answer is the most valuable training signal. Prioritize those examples for any future fine-tune.
5. **Per-payer / per-form schemas.** `FORM_SECTIONS` becomes a tenant-scoped resource; each tenant's `field_reviews` informs its own routing.

The endgame is the opposite of the current diagram: a single, calibrated, possibly fine-tuned model handling 90% of fields, the ensemble reserved for the long tail where it still beats a soloist. The MVP is built so that transition is a config change, not a rewrite.

---

## What I'd improve with more time

- **Offline eval harness.** Ground-truth JSON for the 6 sample docs + metrics in CI: exact match, normalized edit distance, agreement %, per-field accuracy by branch. Today accuracy is measured *online* from user edits, which is useful but slow.
- **Streaming results to the UI.** Server-Sent Events so users see Doc AI's bboxes appear immediately while vision branches are still running.
- **Async queue** (Inngest / Upstash QStash) instead of holding a 5-minute Vercel request open.
- **Calibrated confidence.** Today confidence is model-reported + agreement heuristic. A calibrator trained on `field_reviews` would give a real probability of error per field.
- **Per-field routing.** `field_reviews` already shows which fields some branches systematically lose. Route those fields to the consistent winner instead of voting.
- **Multi-form / multi-tenant.** Today `FORM_SECTIONS` is hard-coded to Doc 07. Promote it to a per-tenant resource for other payers.
- **PHI safety.** This is a demo — no BAA in place with the AI vendors. Production would need HIPAA review and BAAs with OpenAI, Anthropic, and Google.

---

## License

Technical assessment / demo. Not for use with real PHI without proper compliance review.
