# 06 — BBox highlight + confidence on hover

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

The **BBoxOverlay** deep module. Hovering a `FieldCard` highlights the corresponding region in the PDF panel and shows a confidence tag. Leaving the card clears both. If the bbox is on a different page than the one currently visible, the PDF panel jumps to that page automatically.

## What BBoxOverlay encapsulates

- Pure-render component: given a normalized bbox (`{ page, x, y, width, height }` in 0–1), rendered page dimensions, and a confidence number, position the highlight rectangle and confidence tag absolutely
- Coordinate math: normalized → pixel positions on the current page
- The hovered state is owned by the review page; `BBoxOverlay` is a stateless display

## Visual spec (from PRD)

- Highlight: `--navy` border, `rgba(30,58,95,0.08)` fill, `--r-sm` radius
- Confidence tag: `--navy` background, white text in `Geist Mono`, anchored to the top-right corner of the highlight, formatted as e.g. `94%`
- Confidence never appears in the form sidebar — only here

## Acceptance criteria

- [ ] Hovering a `FieldCard` shows the highlight + confidence tag in the PDF panel
- [ ] `onMouseLeave` removes both immediately
- [ ] When the hovered field's bbox is on a different page, the PDF panel scrolls/navigates to that page before the highlight renders
- [ ] Highlight positions correctly across PDF zoom levels (recompute when rendered page dimensions change)
- [ ] Hovering a Missing field shows no highlight (there is no bbox)
- [ ] Confidence tag rendering: round to whole percent (e.g. `0.937` → `94%`)

## Blocked by

- 05-review-screen
