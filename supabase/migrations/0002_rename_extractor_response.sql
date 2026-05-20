-- Rename extractions.raw_mistral_response → raw_extractor_response.
-- The column was originally named after Mistral OCR (single provider). It
-- now holds the full ensemble payload: Doc AI output, per-branch responses
-- (Doc AI structurer, OpenAI vision, Claude vision), and reconciliation
-- metadata. The new name reflects what's actually stored.
alter table public.extractions
  rename column raw_mistral_response to raw_extractor_response;
