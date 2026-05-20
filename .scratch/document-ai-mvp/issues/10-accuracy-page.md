# 10 — Accuracy page

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

`/accuracy` route. Aggregate over `field_reviews` for the current user (RLS scopes automatically). Three stat cards across the top — total fields reviewed, approval count, corrected count — and a per-field table below with a correction-rate bar.

## Aggregation

For the current user's rows:

```sql
select
  field_name,
  count(*) as total,
  count(*) filter (where approved = true) as approved,
  count(*) filter (where approved = true and was_edited = true) as corrected,
  round(
    count(*) filter (where approved = true and was_edited = true)::numeric
    / nullif(count(*), 0) * 100, 1
  ) as correction_rate_pct
from field_reviews
group by field_name
order by correction_rate_pct desc nulls last;
```

The denominator is reviewed fields (not extracted fields) — slice 07's lazy row creation makes this honest by construction.

## Visual

- Three stat cards on `--canvas`, white surface, `--r-md`
- Per-field table: human-readable label (via the `lib/types.ts` map), field name in `Geist Mono`, count columns, then a horizontal bar
- Bar fill: `--navy`. Bar track: `--gray-100`. No red/yellow semantic colors anywhere on this view
- Empty state when the user has zero approvals: "No fields reviewed yet"

## Acceptance criteria

- [ ] `/accuracy` is reachable from the nav, gated by auth
- [ ] Stat cards show total reviewed, approved count, corrected count — sourced from the aggregation above
- [ ] Per-field table lists every field with at least one review row, sorted by correction rate descending
- [ ] Bar widths reflect the correction rate (0–100%), in navy only
- [ ] Approving fields on a review screen updates the Accuracy page on next visit
- [ ] Each user sees only their own aggregates (RLS)

## Blocked by

- 07-field-approval
