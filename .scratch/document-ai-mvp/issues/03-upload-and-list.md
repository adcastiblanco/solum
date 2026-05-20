# 03 — Upload + dashboard list

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

File picker on the dashboard accepting `multiple` PDFs. Each file uploads to Supabase Storage at `{user_id}/{document_id}-{filename}`, inserts a `documents` row with `status = 'pending'`, and appears in the dashboard list immediately. No extraction yet — status remains `pending`. The list shows filename, status badge, and created timestamp.

## Acceptance criteria

- [ ] Upload button accepts multiple PDFs natively (`<input multiple>`)
- [ ] Files are uploaded to the `documents` Supabase Storage bucket under the `{user_id}/` prefix; storage path includes the document UUID to avoid filename collisions
- [ ] A `documents` row is inserted with `status = 'pending'` before upload completes; row appears in the dashboard list within the same render
- [ ] Dashboard list shows filename, status badge, created timestamp; clicking a row navigates to `/review/{documentId}` (target page may 404 until slice 05)
- [ ] Status badge uses navy for `pending`, no semantic colors
- [ ] Uploading the same filename twice produces two rows with distinct storage paths

## Blocked by

- 02-auth-shell
