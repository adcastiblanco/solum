# 05 — Review screen: PDF viewer + form sidebar

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

Split-view at `/review/[documentId]`: `react-pdf` renders the PDF on the left, the extracted fields render as a vertical list of `FieldCard` components on the right. Every field in the schema appears, including fields where Mistral returned `null` (rendered in the **Missing** state with placeholder text). Inputs are inline-editable. No approval, no bbox highlight yet — those come in slices 06 and 07.

## What's in this slice

- Page-level layout: 60/40 split, PDF left, form right, both inside a `--r-lg` card on `--canvas`
- PDF rendering via `react-pdf`, multi-page navigable (paginate or scroll-stacked — either is fine if all pages are reachable)
- A `lib/types.ts` map from snake_case field name to human-readable label (e.g. `patient_dob` → "Date of Birth"); the schema set is fixed
- `FieldCard` component with the four-state visual treatment from the PRD, but the **Approved** state is unused this slice
- Local React state holds edits in memory until slice 07 wires up persistence

## Field state visuals (from PRD)

| State | Appearance |
|---|---|
| Neutral | white card, gray border |
| Hovered | `--navy-light` background, navy border |
| Missing | gray-tinted background, placeholder text |

## Acceptance criteria

- [ ] `/review/[documentId]` loads the document and its latest extraction; 404 if not owned by the current user (RLS)
- [ ] PDF renders client-side via `react-pdf`; all pages are reachable
- [ ] Every schema field appears as a `FieldCard`, including null-valued ones in the Missing state
- [ ] Field values are editable inline; edits are held in local React state
- [ ] Field names render in `Geist Mono`, labels in `Geist`
- [ ] No emojis anywhere on the page

## Blocked by

- 04-extraction-and-polling
