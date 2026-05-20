# Solum Health — Document AI MVP

> Submission for the Solum Health technical challenge.
> A web app that ingests heterogeneous clinical documents (clean PDFs, scanned faxes, handwritten notes, insurance cards, lab reports), extracts structured data with a **three-model ensemble**, auto-fills the *Service Request Form*, and lets a human review/correct each field with the source PDF anchored next to it.

**Live demo:** https://solum.auralabs.life/
**Walkthrough (Loom):** _add link here_
**Full architecture + diagrams + DB schema:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Approach

1. **Upload** PDFs or images (PNG / JPG / WebP / GIF / BMP / TIFF) — same pipeline for both.
2. Each branch first decides if the doc is clinical at all (**embedded out-of-scope gate**). Majority "no" → zero fields + amber banner; no hallucinated patient data on a pizza menu.
3. **Three extractors run in parallel** against the same JSON schema (Doc 07):
   - **Google Document AI** → OCR + per-token bounding boxes → **GPT-5 mini** structurer
   - **OpenAI GPT-4o** vision over the raw file
   - **Anthropic Claude Sonnet 4.5** vision over the raw file
4. **Deterministic reconciler** votes per field with **Doc AI as source of truth**. 2-of-3 agreement wins; lone vision proposals are *suppressed but surfaced* as soft suggestions so hallucinations don't slip in. Genuine disagreements are flagged, never hidden.
5. **BBox grounding** anchors each winning value back to Doc AI tokens (one bbox per phrase for longtext) so the review UI highlights the exact region on hover.
6. The review UI shows confidence, multi-region highlights, edit state (`was_edited`), and approval state. Every edit is persisted and feeds an **accuracy dashboard** — the feedback loop for a future routing / fine-tuning strategy.

---

## AI tools used

The challenge brief explicitly asks for an honest breakdown. Here it is.

### In the product (runtime)

| Tool | Role |
|---|---|
| **Google Document AI** | Authoritative OCR — per-token text + bounding boxes. Single source of truth for *where* a value is on the page. |
| **OpenAI GPT-4o** (vision) | Independent extractor — reads the PDF as images, returns the schema directly. Best on clean typed and structured documents. |
| **Anthropic Claude Sonnet 4.5** (vision) | Independent extractor — same input, different model family. Handles handwritten / messy docs better than GPT-4o in our tests. |
| **GPT-5 mini** | Cheap structurer — turns Doc AI's markdown into the same `ExtractedField[]` schema so the OCR branch can vote alongside the vision branches. |

Adding a fourth extractor (Gemini, Mistral OCR, etc.) is a 30-line change — every branch returns `ExtractorResult` and the reconciler is provider-agnostic.

### To build the product

| Tool | How it was used |
|---|---|
| **Claude Code** | Primary IDE/agent — pipeline scaffolding, schema generation from the *Service Request Form*, reconciliation logic, this README. |
| **Claude Cowork** | Pair-programming / parallel agent loops for larger refactors. |
| **Claude Chrome Extension** | In-browser doc/PDF inspection while iterating on prompts and review UX. |
| **AI Hero Skills** | Reusable skill packs (review, diagnose, simplify, etc.) plugged into Claude Code. |
| **Wispr Flow** | Voice-to-prompt — drafting prompts, design notes, and this very document hands-free. |
| **ChatGPT** | Second opinion on prompt design, schema trade-offs, and edge-case framing. |

### MCP / CLI

| Tool | Used for |
|---|---|
| **Supabase CLI** | Project linking, migrations (`db push`), local stack (`start` / `db reset`). |
| **gcloud CLI** | Document AI processor setup, service-account creation, IAM bindings. |
| **GitHub CLI (`gh`)** | Repo bootstrap, PRs, secrets for Vercel + Actions. |

---

## Architecture decisions (and trade-offs)

1. **Ensemble over single-model.** A single vision LLM on these documents hallucinates dates, member IDs, and CPT codes silently. Three independent branches turn silent errors into visible disagreements. **Cost:** 3× per-doc API spend. **Worth it** because the human-in-the-loop signal (`disagreement`) is what makes the tool trustworthy.

2. **Embedded out-of-scope gate, not an upfront classifier.** The "is this medical?" check rides on each branch's existing prompt — zero extra latency / cost on the happy path, and three independent votes tolerate one branch being overly strict. The upfront short-circuit is the next optimization, not the first.

3. **Doc AI is the source of truth.** LLM-reported confidence is unreliable (LLMs overconfide). Doc AI's OCR is anchored in real document tokens, so it wins ties and breaks no-consensus. Lone OpenAI/Claude proposals are suppressed but surfaced as soft suggestions in the UI.

4. **BBox grounding decoupled from extraction.** Vision LLMs are unreliable at coordinates. Doc AI is reliable. Decoupling lets each side improve independently — switching a vision model doesn't break the overlay.

5. **Disagreement as a first-class citizen.** The reconciler never pretends to be confident when models conflict. The UI flags it instead.

6. **Declarative schema (`FORM_SECTIONS`).** The form (Doc 07) is encoded once in `lib/types.ts` and drives prompts, reconciliation, validation, and UI. Changing a field is a single edit.

7. **RLS before app-layer auth.** Authorization lives in Postgres, not handlers. Endpoints can't forget to filter by `user_id` — the database refuses.

8. **Failure isolation with `Promise.allSettled`.** If one provider is down, extraction degrades (2 branches instead of 3) but doesn't break. The error is persisted alongside the extraction.

9. **Sync request, not a queue (MVP).** Vercel `maxDuration = 300s` is enough for the sample docs. Production would replace this with a queue + SSE/WebSocket updates.

10. **No Prisma, no FastAPI, no Railway.** Supabase typed client + raw SQL migrations covered everything an ORM would. Next.js API routes on Vercel covered everything a separate FastAPI/Railway service would. One fewer abstraction layer to debug in a 1-week MVP.

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

# 4. Run
npm run dev
# → http://localhost:3000
```

**Smoke test the pipeline** (no DB writes): `npx tsx scripts/test-pipeline.ts <path-to-pdf>`

**Offline eval** vs. LLM-generated ground truth: `npm run eval:generate` then `npm run eval`. Report lands in `scripts/eval/results/<iso>.md`. See `scripts/eval/README.md`.

---

## What I'd improve with more time

- **Streaming results to the UI** (SSE) — Doc AI's bboxes appear immediately while vision branches are still running.
- **Async queue** (Inngest / Upstash QStash) instead of holding a 5-minute Vercel request open.
- **Calibrated confidence** trained on `field_reviews` — a real probability the user will edit a field, not a model self-report.
- **Per-field routing.** `field_reviews` already shows which branches systematically lose at which fields; route those fields to the consistent winner instead of voting.
- **Multi-form / multi-tenant.** Promote `FORM_SECTIONS` to a per-tenant resource for other payers.
- **PHI safety.** This is a demo — no BAA in place with the AI vendors. Production needs HIPAA review and BAAs with OpenAI, Anthropic, and Google.

---

## License

Technical assessment / demo. Not for use with real PHI without proper compliance review.
