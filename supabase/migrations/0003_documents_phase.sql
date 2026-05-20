-- Track sub-phase within `status = 'processing'` so the dashboard can render
-- a 4-block progress ring instead of an opaque "processing" badge.
--
-- Phase semantics:
--   0 = not started yet (pending or just queued)
--   1 = OCR running (Doc AI tokens + markdown)
--   2 = ensemble extraction running (Doc AI structurer + OpenAI + Anthropic in parallel)
--   3 = reconcile + bbox grounding + persistence
--   4 = done (final, terminal)
alter table documents
  add column if not exists phase smallint not null default 0;
