# 07 — Field approval + edit tracking

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

The **FieldReviewService** deep module and the `/api/review` route. Clicking the check button on a `FieldCard` persists an approval to `field_reviews`. Lazy row creation: a row exists only after first approval. `was_edited = (finalValue !== originalValue)`. Approved fields render in the **Approved** visual state, and the state survives page refresh. Re-clicking approve is idempotent — no duplicate row, no `was_edited` regression.

## What FieldReviewService encapsulates

Single function `approveField({ extractionId, fieldName, originalValue, finalValue, confidence, bbox })`:

- If no `field_reviews` row exists for `(extraction_id, field_name)`, insert one with `approved=true`, `was_edited=(finalValue !== originalValue)`, plus the supplied confidence and bbox snapshots
- If a row already exists, update `final_value` to the new value, set `was_edited` to true if it differs from `original_value`, leave `original_value` and `confidence` untouched
- Idempotent: calling with the same arguments twice yields the same database state

## Approved state visual (from PRD)

- Background: `--green-50`
- Border + check icon: `--green-700`
- Check button: filled green circle, persistent
- 28×28 px check button with the three sub-states (default gray, hover green outline, approved filled)

## Acceptance criteria

- [ ] `lib/field-reviews.ts` exports `approveField` with the interface above
- [ ] `/api/review` accepts `{ extractionId, fieldName, originalValue, finalValue, confidence, bbox }` and calls `approveField`
- [ ] Clicking the check button persists the approval and flips the card to the Approved state
- [ ] Editing the value, then approving, sets `was_edited = true`; approving an unedited value leaves `was_edited = false`
- [ ] Refreshing the review page restores all prior approvals — `original_value` is read from `extracted_fields`, `final_value` and `was_edited` from `field_reviews`
- [ ] Calling approve twice on the same field does not create a duplicate row and does not regress `was_edited` from true back to false
- [ ] The Approved state is the only place green appears on the page

## Blocked by

- 05-review-screen
