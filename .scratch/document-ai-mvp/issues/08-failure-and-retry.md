# 08 — Failure handling + Retry

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

When Mistral extraction fails, `/api/extract` catches the error, writes a user-facing message to `documents.error_message`, and sets `status = 'error'`. The dashboard renders an `Error` badge for those rows; hovering the badge shows the message. A Retry button next to the badge re-fires `/api/extract` for that document, which re-enters the normal `processing → done` path.

## Error message conventions

The route maps the typed errors from `MistralExtractor` into short human-readable strings — examples:

- "Mistral OCR timed out"
- "Unsupported document format"
- "Document could not be read"
- "Extraction failed — try again"

These are stored verbatim in `error_message` and shown in the tooltip.

## Acceptance criteria

- [ ] `/api/extract` wraps the extraction call in try/catch; on failure sets `status='error'` and populates `error_message`
- [ ] The dashboard renders an `Error` badge (navy text, gray border) for rows with `status='error'`
- [ ] Hovering the badge shows `error_message` in a tooltip
- [ ] A Retry button next to the badge calls `/api/extract` for that document; the row transitions back to `processing` and either succeeds or re-errors
- [ ] Retrying clears `error_message` when the new attempt succeeds
- [ ] No automatic server-side retry — only user-initiated

## Blocked by

- 04-extraction-and-polling
