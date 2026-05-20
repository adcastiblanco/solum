# Solum Health — Document AI MVP — PRD

Status: ready-for-agent

## Problem Statement

Solum Health staff receive clinical documents (referrals, intake forms, lab results, insurance cards, handwritten notes) and currently re-key the relevant fields into downstream systems by hand. This is slow, error-prone, and unmeasured — there's no way to know which fields are easiest or hardest for any extraction tool to get right.

## Solution

A web app where a reviewer uploads a clinical PDF, sees a structured form auto-filled by Mistral OCR 3 alongside the original PDF, and approves or corrects each field. Field-level approval and correction are recorded so a separate accuracy view can show, per field, how often the extracted value needed correction. A "Run sample batch" action processes seven bundled sample documents in parallel to demonstrate the experience end-to-end without needing real uploads.

## User Stories

1. As a reviewer, I want to sign up with an email and password, so that I can access the app.
2. As a reviewer, I want to log in, so that I see only my own documents and review history.
3. As a reviewer, I want to be redirected to login when I'm not authenticated, so that protected routes aren't exposed.
4. As a reviewer, I want to log out, so that I can hand the machine to a teammate safely.
5. As a reviewer, I want to upload one or more PDFs at once from the dashboard, so that I can process my actual workload.
6. As a reviewer, I want a "Run sample batch" button on the dashboard, so that I can demo the product without real files.
7. As a reviewer, I want each uploaded document to appear in the dashboard list immediately with a `processing` status, so that I know upload succeeded before extraction finishes.
8. As a reviewer, I want the dashboard list to update from `processing` to `done` automatically without me refreshing, so that I see progress while batch is running.
9. As a reviewer, I want a clear `Error` badge with the failure reason on hover when extraction fails, so that I understand what went wrong.
10. As a reviewer, I want a Retry button on failed documents, so that I can recover from transient Mistral failures without re-uploading.
11. As a reviewer, I want to click into any `done` document and reach a review screen, so that I can verify the extracted fields.
12. As a reviewer, I want the review screen to show the PDF on the left and the extracted fields on the right, so that I can compare them at a glance.
13. As a reviewer, I want every field in the schema to appear in the form, including ones Mistral couldn't find, so that I'm aware of gaps.
14. As a reviewer, I want missing fields visually distinguished (gray placeholder), so that I know they need attention.
15. As a reviewer, I want each field's value to be editable inline, so that I can correct it without entering a separate edit mode.
16. As a reviewer, I want to click a check button on each field card to approve it, so that the system records my confirmation.
17. As a reviewer, I want approved fields to turn green and stay green, so that I can see my progress through the document.
18. As a reviewer, I want hovering a field card to highlight the corresponding region in the PDF, so that I can verify where the value came from.
19. As a reviewer, I want a confidence percentage to appear with the highlight, so that I have a sense of how certain the model was.
20. As a reviewer, I want the highlight and confidence tag to disappear when I stop hovering, so that the PDF stays clean.
21. As a reviewer, I want multi-page PDFs to be navigable, so that I can review documents of any length.
22. As a reviewer, I want the bbox highlight to jump to the correct page automatically when I hover a field on another page, so that I don't have to scroll the PDF manually.
23. As a reviewer, I want my edits and approvals to persist, so that I can leave the page and come back.
24. As a reviewer, I want an Accuracy page in the nav, so that I can see per-field correction rates.
25. As a reviewer, I want the Accuracy page to show total reviewed fields, approval count, and corrected count as stat cards, so that I get a high-level read.
26. As a reviewer, I want the Accuracy page to list each field with its correction rate as a bar, so that I can spot which fields are hardest to extract.
27. As a reviewer, I want the Accuracy page to only count fields I actually approved (not extracted-but-ignored fields), so that the correction rate reflects real human judgment.
28. As a reviewer, I want the entire UI to use Solum's brand colors (navy primary, green only for approved state), so that the app feels like a Solum product.
29. As a reviewer, I want no emojis anywhere in the UI, so that the experience stays professional for a clinical context.
30. As a reviewer, I want only my own documents and reviews to be visible to me, so that other users' data is private.

## Implementation Decisions

### Stack

- Next.js 14 App Router, TypeScript, Tailwind.
- Supabase for Auth, Postgres, and Storage. RLS enforces per-user isolation on `documents`, `extractions`, `field_reviews`.
- Mistral OCR 3 (`mistral-ocr-2505`) does OCR, layout, bboxes, and structured-field extraction in a single call via `documentAnnotation`.
- Client-side PDF rendering via `react-pdf` (pdf.js). No server-side PDF-to-image conversion. Works uniformly for digital, scanned, and handwritten PDFs.
- Deploy on Vercel. GitHub for source.

### Schema (per `docs/solum-implementation.md`, with one addition)

- `documents` — adds `error_message text` column so failed extractions can surface the reason on hover.
- `extractions` — stores `raw_mistral_response` and `extracted_fields` (the structured annotation).
- `field_reviews` — created lazily, on first approval of a field. One row per (extraction, field). Stores `original_value`, `final_value`, `was_edited`, `approved`, `confidence`, `bbox`.

### Mistral schema shape

Each field in the document annotation schema is wrapped as `{ value, confidence, bbox }`:
- `value` — string or string[] depending on field
- `confidence` — number 0.0–1.0, self-reported per field
- `bbox` — `{ page, x, y, width, height }` normalized 0–1; a single enclosing rectangle even for array/multi-line fields

The prompt explicitly asks the model to return `null` for missing fields and to estimate confidence based on legibility.

### Deep modules

- **MistralExtractor** (`lib/mistral.ts`) — single function `extractDocument(signedUrl) → { fields: ExtractedField[] }`. Encapsulates schema construction, the OCR call, response normalization, and error mapping. Callers never see the raw Mistral SDK shape.
- **FieldReviewService** (`lib/field-reviews.ts`) — single function `approveField({ extractionId, fieldName, originalValue, finalValue, confidence, bbox })`. Encapsulates the lazy-row-creation rule and the `was_edited` determination (`finalValue !== originalValue`). Idempotent on repeated approvals.
- **BBoxOverlay** (`components/BBoxOverlay.tsx`) — pure render component. Given a normalized bbox and rendered page dimensions, positions the highlight rectangle and confidence tag absolutely.
- **useDocumentPolling** (`hooks/useDocumentPolling.ts`) — polls `GET /api/documents` every 2–3 s while any document is `processing`, stops when none are. Returns the document list and a loading flag.

The rest is shallow orchestration: pages, the field form, the nav, the sample batch trigger.

### Status updates

Polling, not Realtime. The dashboard polls every 2–3 s while any doc is `processing`. Survives page refresh mid-batch (Realtime-as-future-work in the original doc was a real gap).

### Failure handling

- `/api/extract` catches Mistral errors and writes `status = 'error'` plus a user-facing `error_message` (e.g. "Mistral OCR timed out", "Unsupported document format").
- Dashboard renders an `Error` badge; the message appears on hover.
- A Retry button on the badge re-fires `/api/extract` for that document — same code path as initial extraction.

### Sample batch

- Seven PDFs bundled at `public/samples/01-clinical-progress-note.pdf` … `07-service-request-form.pdf`.
- "Run sample batch" button fetches each, uploads to Supabase Storage, inserts a `documents` row, and calls `/api/extract` — all 7 in parallel via `Promise.all`.
- Documents appear in the list immediately with `processing` status. Polling picks up the transitions.

### Auth

- Email + password via Supabase Auth. Open signup as designed.
- Middleware uses `createServerClient` from `@supabase/ssr` (the doc's `createMiddlewareClient` doesn't exist in the current SDK).
- Unauthenticated users are redirected to `/login` for all non-auth routes.

### Storage convention

`{user_id}/{document_id}-{original_filename}`. The `user_id` prefix is what the RLS policy keys on. Including the document UUID avoids collisions when a user uploads the same filename twice.

### Field labels

A hardcoded snake_case → human-readable map lives in `lib/types.ts` (e.g. `patient_dob` → "Date of Birth"). The schema field set is fixed for MVP.

### Field state machine

Per the original doc:
- **Neutral** (white, gray border) — default after extraction.
- **Hovered** (navy tinted, navy border) — mouse over the card; triggers bbox highlight.
- **Approved** (green-50 bg, green-700 border, check filled) — user clicked the check; persisted in `field_reviews`.
- **Missing** (gray tinted, placeholder text) — Mistral returned `null` for value.
- No rejected state. Editing a value keeps the card neutral until check is clicked. If the user edits and then approves, `was_edited = true`.

### Accuracy query

Aggregates over `field_reviews` only — denominator is reviewed fields, not extracted fields. Three stat cards (total reviewed, approval count, corrected count) plus a per-field table with a navy correction-rate bar. No semantic red/yellow colors in this view.

## Testing Decisions

No automated tests for the MVP, per user direction. Validation is by manually running the sample batch end-to-end on a deployed Vercel preview:

1. Sign up, run sample batch, all 7 docs reach `done` (or `error` with a sensible message).
2. Open one document, hover fields, verify the bbox highlight lands on the right region and jumps pages when needed.
3. Edit a value, approve it; verify it stays green on refresh.
4. Approve the same field again; verify no duplicate `field_reviews` row.
5. Visit `/accuracy`; verify counts and per-field bars reflect approvals.
6. Simulate a failure (rename a sample PDF to something unsupported, or revoke the Mistral key briefly); verify the error badge and retry path.

Good tests, when added post-MVP, should target external behavior of the deep modules — `FieldReviewService.approveField` (lazy creation, `was_edited` correctness, idempotency), `MistralExtractor.extractDocument` (response normalization and error mapping with a mocked client), and `BBoxOverlay` (coordinate math). They should not assert on Supabase query shapes or React internals.

## Out of Scope

- Supabase Realtime — polling is sufficient for MVP.
- Server-side PDF-to-image conversion (`pdf2pic`). Client-side `react-pdf` handles all needed cases.
- Drag-and-drop upload zone. Native file picker with `multiple` is enough.
- Exporting an approved form as a filled PDF.
- Per-array-item bboxes (e.g. one bbox per medication). MVP uses a single enclosing rectangle per field.
- Rejected/flagged field state. Reviewers approve or leave neutral.
- Signup gating (allowlist by email domain). Open signup as written.
- Server-side auto-retry of failed extractions. Retry is user-initiated only.
- Pre-calibrated confidence. The score is the model's self-report, surfaced as-is.
- Schema-level changes per document type. One unified clinical schema covers all sample doc types.
- Tests. To be added post-MVP.

## Further Notes

- Brand alignment matters: navy `#1E3A5F` for all interactive elements, green only for approved state, `Instrument Serif` italic for page titles, `Geist` for body, `Geist Mono` for field names and confidence values. No emojis anywhere.
- Confidence appears only as a tag on the bbox highlight on hover — never in the form sidebar. This keeps the form readable and avoids implying the score is calibrated.
- `was_edited` is the real accuracy signal, not confidence. Confidence is decorative; correction rate is the metric this MVP exists to produce.
- The Mistral key is server-side only. The browser never sees it.
- Sample PDF files must be added to `public/samples/` before the sample batch button does anything useful — code paths are scaffolded to read from that directory regardless of whether files exist yet.
