# 04 — Mistral extraction + status polling

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

Wire up the **MistralExtractor** deep module and the `/api/extract` route. On upload, the client calls `/api/extract` for each new document. The route signs a Storage URL, calls Mistral OCR with the clinical schema, persists the result to `extractions`, and flips `documents.status` to `done`. The **useDocumentPolling** hook polls `/api/documents` every 2–3 s on the dashboard while any document is `processing`, stops when none are. Document rows transition `pending → processing → done` visibly.

## What MistralExtractor encapsulates

- Schema construction: each field declared as `{ value, confidence, bbox: { page, x, y, width, height } }`, where `value` is string or string[], `confidence` is 0.0–1.0, and `bbox` is a single enclosing rectangle for the field's content
- The OCR call with `mistral-ocr-2505` and `documentAnnotation`
- Response normalization to `{ fields: ExtractedField[] }` — callers never see raw Mistral SDK shapes
- Error mapping (timeout, schema-rejection, transport) into typed errors the route can surface as `error_message`

## Acceptance criteria

- [ ] `lib/mistral.ts` exports `extractDocument(signedUrl)` with the interface above
- [ ] `/api/extract` accepts `{ documentId }`, sets `status='processing'`, runs extraction, inserts an `extractions` row with `raw_mistral_response` and `extracted_fields`, sets `status='done'`
- [ ] `/api/documents` returns the current user's documents (latest first), respecting RLS
- [ ] `useDocumentPolling` polls every 2.5 s while any doc is `processing` and stops when none are
- [ ] Uploading a PDF on the dashboard now produces a row that flips `pending → processing → done` without manual refresh
- [ ] Page refresh during processing recovers cleanly — polling resumes for in-flight docs
- [ ] Mistral key is read server-side only (never appears in `NEXT_PUBLIC_*` env)

## Blocked by

- 03-upload-and-list
