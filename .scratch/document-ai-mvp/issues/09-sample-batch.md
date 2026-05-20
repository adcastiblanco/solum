# 09 — Sample batch

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

A "Run sample batch" button on the dashboard. Clicking it fetches each sample PDF from the public Supabase Storage bucket `samples`, uploads it to the user's `documents` bucket, inserts a `documents` row, and triggers `/api/extract` — all in parallel via `Promise.all`. Rows appear immediately as `processing` and transition to `done` via the existing polling.

## Sample files (already uploaded to Supabase Storage)

Public bucket `samples` contains:

- `02-referral-letter.pdf`
- `03-insurance-card.pdf`
- `04-lab-results.pdf`
- `05-patient-intake-form.pdf`
- `06-handwritten-clinical-note.pdf`
- `07-service-request-form.pdf`

Public URL pattern: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/samples/<filename>`

There are only 6 PDFs (no `01-clinical-progress-note.pdf`). Do not bundle the files in the repo — fetch them from the public bucket at runtime.

## Acceptance criteria

- [ ] Dashboard has a "Run sample batch" button styled with the navy primary
- [ ] Clicking it fetches each of the 6 sample PDFs from the public `samples` bucket
- [ ] Each fetched file is uploaded to the user's `documents` bucket at `{user_id}/{document_id}-<filename>`
- [ ] A `documents` row is inserted per file with `status='pending'`, then extraction is triggered — all 6 in parallel
- [ ] All sample rows appear in the dashboard list within the same render and transition `pending → processing → done` via the existing polling
- [ ] If a fetch fails for any single file, that file is skipped and the other 5 still proceed (no all-or-nothing failure)
- [ ] No separate batch page or route — the button lives on the dashboard

## Blocked by

- 04-extraction-and-polling
