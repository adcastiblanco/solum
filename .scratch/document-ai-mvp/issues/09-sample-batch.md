# 09 — Sample batch

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

Copy the bundled sample PDFs from `files/` into `public/samples/` (so they ship as static assets), then add a "Run sample batch" button on the dashboard. Clicking it fetches each sample, uploads to Supabase Storage, inserts a `documents` row, and triggers `/api/extract` — all in parallel via `Promise.all`. Rows appear immediately as `processing` and transition to `done` via the existing polling.

## Sample files

Expected at `public/samples/`:

- `01-clinical-progress-note.pdf` *(missing from `files/` — to be added separately by the user; button should still work for the 6 present)*
- `02-referral-letter.pdf`
- `03-insurance-card.pdf`
- `04-lab-results.pdf`
- `05-patient-intake-form.pdf`
- `06-handwritten-clinical-note.pdf`
- `07-service-request-form.pdf`

## Acceptance criteria

- [ ] The 6 present PDFs from `files/` are copied to `public/samples/` and committed
- [ ] Dashboard has a "Run sample batch" button styled with the navy primary
- [ ] Clicking it uploads each present sample, inserts a `documents` row per file, and triggers extraction — all in parallel
- [ ] All sample rows appear in the dashboard list within the same render, with `processing` status
- [ ] If `01-clinical-progress-note.pdf` is missing, that single fetch fails silently and the other 6 still proceed
- [ ] No separate batch page or route — the button lives on the dashboard

## Blocked by

- 04-extraction-and-polling
