# Loom walkthrough script — Solum Health technical challenge

**Target length:** 6–8 minutes. Speak in English. Don't read this verbatim — it's a beat sheet.

---

## 0. Setup before hitting record

- Browser tabs open in this order:
  1. The deployed app (logged out, on the login page).
  2. The GitHub repo on the README.
  3. The repo open in your editor at `app/api/extract/route.ts`.
  4. The Supabase dashboard, on the `field_reviews` table.
- Have sample docs **01 (clean clinical note)** and **06 (handwritten)** ready to drag in.
- Close Slack, email, anything that pings.
- Mic check. One sentence on camera to confirm levels.

---

## 1. Hook — 20 seconds

> "Hi, I'm Angel. This is my submission for the Solum Health technical challenge. The app takes any of the sample documents — clean clinical notes, scanned referrals, even the handwritten one — and auto-fills the Service Request Form using a three-model ensemble. I'll show you the product first, then how it's built, then what I'd do next."

**Goal:** they know in 20 seconds what they're about to watch.

---

## 2. Live demo — ~3 minutes

**(a) Upload the clean doc — 01.**

> "I'll start with the clean clinical progress note. I drop it on the dashboard, and you can see the document is queued."

Wait for the extraction. While it runs:

> "Behind the scenes three extractors are running in parallel: Google Document AI for OCR with bounding boxes, GPT-4o reading the PDF directly, and Claude Sonnet 4.5 doing the same. I'll explain why three in a minute."

When it finishes, open the review screen.

> "Here's the auto-filled Service Request Form on the right, and the original PDF on the left. When I hover a field — patient name, member ID, a CPT code — the exact region of the PDF lights up. That's the human-in-the-loop part: a reviewer can verify each value in one glance instead of re-reading the whole document."

Edit one field deliberately.

> "When I correct a field, it's persisted with `was_edited = true`. That's the signal that feeds the accuracy view."

**(b) Upload the hard doc — 06, handwritten.**

> "Now the stress test — the handwritten note. This is where a single model usually fails silently. Watch what happens with the ensemble."

When it finishes, point at a disagreement-flagged field.

> "Notice this field has a warning. That means the three branches didn't agree, so instead of pretending to be confident we surface it for review. I'd rather show 'we're not sure' than confidently put the wrong member ID into a payer's portal."

**(c) Accuracy page.**

> "And here's the accuracy dashboard — correction rate by field, across all the documents I've processed. Over time, this tells us which fields the extractors systematically lose on, and we can route those fields to a different branch or refine the prompt."

---

## 3. Architecture — ~2 minutes

Switch to the README, scroll to the Mermaid architecture diagram.

> "Quick tour of how it's built. Next.js 16 on Vercel, Supabase for Postgres + Storage + auth, with Row Level Security so authorization lives in the database, not the handlers."

Scroll to the sequence diagram.

> "The extraction pipeline does one thing well. Doc AI runs first because we need its tokens for grounding. Then the three branches run in parallel using `Promise.allSettled` — if one vendor is down, we degrade to two branches instead of breaking. Every branch returns the same `ExtractedField[]` shape, so the reconciler is provider-agnostic."

Switch to `lib/reconciler.ts` briefly.

> "The reconciler votes per field, type-aware: text fields use normalized exact match, long text falls back to Jaccard similarity over tokens, lists are set comparison, tables align rows by their key column. Two-of-three wins. Zero-of-three is tagged as a disagreement and surfaced in the UI."

Switch to `lib/bbox-grounding.ts`.

> "One decision I want to call out: vision LLMs are unreliable at coordinates. Doc AI is reliable. So I decoupled 'what value is correct' — the ensemble — from 'where is it on the page' — Doc AI tokens. After the ensemble picks a winner, I search that value in Doc AI's tokens to anchor it visually. That separation means I can swap or add vision models without losing the highlight feature."

---

## 4. AI tools used — ~1 minute

Scroll README to the *AI tools used* section.

> "On the tooling side: Document AI for OCR, GPT-4o and Claude Sonnet 4.5 for vision extraction, GPT-4o-mini as a cheap structurer that turns Doc AI's markdown into the same schema so the OCR branch can vote alongside the vision ones. The app itself was built with Claude Code — pipeline scaffolding, the reconciler, the schema encoding of Doc 07, even this README — with Cursor for inline edits. Adding a fourth extractor like Gemini is roughly a thirty-line change."

---

## 5. Trade-offs and what I'd improve — ~1.5 minutes

> "A few trade-offs I'd flag for the conversation."

- **Cost.** Three models per document is ~3× the API spend of a single-model approach. The reason it's worth it is the disagreement signal — that's the thing that makes the tool trustworthy enough to actually use in production. Without it, you get a confident wrong answer and no way to know.
- **Sync request, not a queue.** Vercel's 300-second limit is fine for the six sample docs. In production I'd replace this with a queue (Inngest or QStash) plus Server-Sent Events so the UI streams Doc AI's bboxes immediately while vision branches finish.
- **Confidence isn't calibrated.** Today it's model-reported plus an agreement heuristic. With `field_reviews` data I'd train a calibrator that gives a real probability of error per field.
- **Offline eval.** Right now accuracy is measured online from user edits. With more time I'd build a ground-truth set for the six sample docs and run exact-match + edit-distance metrics in CI per branch.
- **PHI / HIPAA.** This is a demo. Real deployment needs BAAs with OpenAI, Anthropic, and Google plus a compliance review.

---

## 6. Close — 15 seconds

> "That's the submission. Repo and live link are in the email — README has the architecture, AI tools, and trade-offs in writing. Happy to walk through any of this in more detail. Thanks for the challenge."

End recording.

---

## After recording

- Watch it back at 1.5×. If a section drags, re-record just that section in Loom (it supports trim-and-replace).
- Set the Loom title to `Solum Health — Document AI MVP — Angel Castiblanco`.
- Add chapter markers in Loom for: Demo, Architecture, AI tools, Trade-offs.
- Send the link + repo + live URL in one reply.
