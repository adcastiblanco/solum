# Prompt — add image upload support

Copy/paste this into a fresh Claude Code session in this repo.

---

The challenge brief says we should accept "PDFs, images, scanned forms" but right now the uploader only accepts `application/pdf`. Add image support end-to-end.

**Scope:**

1. **Uploader (`app/(app)/dashboard/uploader.tsx`)** — change `accept="application/pdf"` to also allow `image/png`, `image/jpeg`, `image/webp`. Keep the same `multiple` behavior. The existing `contentType: file.type || "application/pdf"` line in the upload call already does the right thing.

2. **Review viewer (`app/(app)/review/[documentId]/pdf-viewer.tsx`)** — today this uses `react-pdf`. When the document is an image (detect from `documents.file_name` extension or by content type via Supabase Storage `head` request), render an `<img>` instead. Keep the bbox overlay system working — bboxes are in normalized 0–1 coords so the overlay layer doesn't need to change, just the underlying element.

3. **Extractor branches** — verify nothing breaks:
   - `lib/docai.ts`: Google Document AI accepts images natively, but the mime type sent in the request must match. Check `fetchPdfBytes` / `ocrDocument` — if it hard-codes `application/pdf`, branch on the content type.
   - `lib/openai-extractor.ts`: GPT-4o vision already accepts images. Today the call uses the PDF file API; for images, switch to `image_url` with a base64 data URL. Or pass the buffer through the file API if it accepts images.
   - `lib/anthropic-extractor.ts`: Claude's `document` block is PDF-only. For images, use the `image` content block (`{ type: "image", source: { type: "base64", media_type, data } }`).
   - Easiest pattern: a tiny dispatcher in `lib/extractor-shared.ts` that returns the right content block per mime type, used by both vision branches.

4. **End-to-end test** — drop a JPG of an insurance card into the uploader, run extract, confirm the review screen renders the image with bbox overlays. Update `scripts/test-pipeline.ts` so it also picks up `.png` / `.jpg` files from `files/`.

5. **README** — under "How it maps to the challenge", explicitly mention image/scan support.

**Out of scope:**

- HEIC / TIFF conversion. Stick to web-friendly formats.
- Multi-page TIFFs.
- Camera capture in the browser.

Be pragmatic — this is an MVP add-on, not a rewrite of the extractor branches. Smallest diff that makes the four format types work end-to-end.
