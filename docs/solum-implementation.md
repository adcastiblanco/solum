# Solum Health — Document AI MVP
## RFC / Implementation Document

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| OCR + BBoxes + Structured JSON | Mistral OCR 3 (`mistral-ocr-2505`) |
| Auth + DB + Storage | Supabase |
| Repo | GitHub |
| Deploy | Vercel |

---

## Design System

Apply consistently across every component. No exceptions.

### Color Palette

```css
:root {
  /* Brand — sourced from getsolum.com */
  --navy:       #1E3A5F;   /* primary: nav, buttons, links, stat values */
  --navy-light: #EAF0F7;   /* navy tint: active states, hover backgrounds */
  --navy-mid:   #2D5380;   /* mid navy: reserved for future use */

  /* Neutrals */
  --white:      #FFFFFF;
  --gray-50:    #F8F8F7;
  --gray-100:   #F0EFED;
  --gray-200:   #E2E0DC;
  --gray-400:   #A8A49E;
  --gray-600:   #6B6763;
  --gray-900:   #1A1916;

  /* Semantic — use sparingly */
  --green-50:   #EAF5F0;   /* approved field background */
  --green-700:  #155F3E;   /* approved field border + text */

  /* Page canvas */
  --canvas:     #F0EEE9;   /* dashboard/accuracy page background */
}
```

### Typography

```css
--font-sans:  'Geist', sans-serif;         /* all body text, labels, buttons */
--font-serif: 'Instrument Serif', serif;   /* page titles, logo only */
--font-mono:  'Geist Mono', monospace;     /* field names, confidence %, code */
```

Install: `npm install geist`
Google Fonts import: `Instrument Serif` (italic variant) + `Geist Mono`

### Spacing & Radius

```css
--r-sm: 6px;    /* inputs, buttons, badges, field cards */
--r-md: 10px;   /* tables, stat cards */
--r-lg: 14px;   /* screen/modal containers */
```

### Rules

- No emojis anywhere in the UI
- Navy (`--navy`) is the only color used for interactive elements
- Green is used exclusively for the approved state
- No color for neutral or editing states — neutral = white card, gray border
- Confidence percentage never appears in the form sidebar — only as a bbox tag in the PDF panel on hover
- Page backgrounds use `--canvas`; card surfaces use `--white`
- Nav background is always `--navy`

---

## Claude Code — Setup Steps (execute in order)

### 1. Scaffold the project

```bash
npx create-next-app@latest solum-health --typescript --tailwind --app
cd solum-health
npm install @mistralai/mistralai @supabase/supabase-js @supabase/ssr geist
```

### 2. Connect Supabase

- Create project named `solum-health` at supabase.com
- Run the schema SQL below
- Copy keys to `.env.local`

### 3. Connect GitHub

```bash
gh repo create solum-health --public --source=. --push
```

### 4. Deploy to Vercel

```bash
npx vercel --yes
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add MISTRAL_API_KEY
```

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MISTRAL_API_KEY=
```

---

## Supabase Schema

```sql
-- Documents uploaded by users
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  status text default 'pending',  -- pending | processing | done | error
  created_at timestamptz default now()
);

-- Extracted form data per document
create table extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  raw_mistral_response jsonb,
  extracted_fields jsonb,
  created_at timestamptz default now()
);

-- Field-level review — one row per field per extraction
create table field_reviews (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid references extractions(id) on delete cascade,
  field_name text not null,
  original_value text,
  final_value text,
  was_edited boolean default false,  -- true if user changed value before approving
  approved boolean default false,
  confidence numeric,                -- 0.0–1.0 from Mistral
  bbox jsonb,                        -- { page, x, y, width, height } normalized 0–1
  reviewed_at timestamptz default now()
);

-- RLS
alter table documents enable row level security;
alter table extractions enable row level security;
alter table field_reviews enable row level security;

create policy "Users see own documents" on documents
  for all using (auth.uid() = user_id);

create policy "Users see own extractions" on extractions
  for all using (
    document_id in (select id from documents where user_id = auth.uid())
  );

create policy "Users see own field reviews" on field_reviews
  for all using (
    extraction_id in (
      select e.id from extractions e
      join documents d on d.id = e.document_id
      where d.user_id = auth.uid()
    )
  );
```

### Storage

```sql
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false);

create policy "Users upload own files" on storage.objects
  for insert with check (auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users read own files" on storage.objects
  for select using (auth.uid()::text = (storage.foldername(name))[1]);
```

---

## Project Structure

```
solum-health/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── dashboard/page.tsx
│   ├── review/[documentId]/page.tsx
│   ├── accuracy/page.tsx
│   └── api/
│       ├── extract/route.ts
│       └── review/route.ts
├── components/
│   ├── Nav.tsx
│   ├── PDFViewer.tsx
│   ├── ServiceRequestForm.tsx
│   └── FieldCard.tsx
├── lib/
│   ├── mistral.ts
│   ├── supabase.ts
│   └── types.ts
└── .env.local
```

---

## Pages

| Route | Description |
|---|---|
| `/login` | Email + password sign in |
| `/signup` | Register |
| `/dashboard` | Document list + upload |
| `/review/[documentId]` | Split view: PDF left, form right |
| `/accuracy` | Correction rate per field |

**No batch page.** "Run sample batch" on the dashboard uploads all 7 sample PDFs via `Promise.all()` and appends them to the list with `processing` status. Upload button accepts `multiple` files natively.

---

## Field States

| State | Appearance | Trigger |
|---|---|---|
| Neutral | White card, gray border | Default after extraction |
| Hovered | Navy-tinted bg, navy border, bbox shown in PDF | Mouse over field card |
| Approved | Green-tinted bg (`--green-50`), green border, check filled | User clicks check button |
| Missing | Gray-tinted bg, placeholder text | Mistral returned null |

**No rejected state.** Users either approve (green) or leave neutral. Editing a value keeps the field neutral until the check button is clicked. If the user edits and clicks approve, `was_edited = true` is recorded — this is how accuracy tracking distinguishes "approved as-is" from "corrected then approved."

**Confidence %** never appears in the form sidebar. It appears only as a tag on the bbox highlight overlay in the PDF panel, triggered by hovering a field card.

---

## Field Card Component

Each field card is a horizontal row:

```
[ field label + editable input ]  [ ○ check button ]
```

The check button is a circle icon (28×28px). States:
- Default: gray border, gray checkmark
- Hover: green border, green checkmark
- Approved: green filled background, green checkmark (persistent)

```tsx
// FieldCard.tsx
interface FieldCardProps {
  fieldName: string;
  label: string;
  value: string | null;
  approved: boolean;
  onApprove: () => void;
  onChange: (val: string) => void;
  onHover: () => void;      // fires bbox highlight in PDFViewer
  onBlur: () => void;       // clears bbox highlight
}
```

---

## Mistral OCR 3 Integration (`lib/mistral.ts`)

```typescript
import Mistral from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const CLINICAL_SCHEMA = {
  type: 'object',
  properties: {
    patient_name:           { type: 'string' },
    patient_dob:            { type: 'string' },
    patient_gender:         { type: 'string' },
    patient_phone:          { type: 'string' },
    patient_address:        { type: 'string' },
    insurance_company:      { type: 'string' },
    member_id:              { type: 'string' },
    group_number:           { type: 'string' },
    provider_name:          { type: 'string' },
    provider_npi:           { type: 'string' },
    facility_name:          { type: 'string' },
    diagnosis_codes:        { type: 'array', items: { type: 'string' } },
    diagnosis_descriptions: { type: 'array', items: { type: 'string' } },
    cpt_codes:              { type: 'array', items: { type: 'string' } },
    medications:            { type: 'array', items: { type: 'string' } },
    clinical_history:       { type: 'string' },
    assessment_scores:      { type: 'string' },
  }
};

export async function extractDocument(fileUrl: string) {
  const response = await client.ocr.process({
    model: 'mistral-ocr-2505',
    document: { type: 'document_url', documentUrl: fileUrl },
    includeImageBase64: false,
    documentAnnotation: {
      schema: CLINICAL_SCHEMA,
      prompt: `You are a medical records specialist. Extract all clinical and patient 
               fields from this document. Return null for any field not found. 
               Include a confidence score 0.0–1.0 per field based on legibility.`
    }
  });

  return {
    pages: response.pages,              // text + bboxes per page
    fields: response.documentAnnotation // structured JSON matching schema
  };
}
```

---

## Extract API Route (`app/api/extract/route.ts`)

```typescript
import { createClient } from '@/lib/supabase';
import { extractDocument } from '@/lib/mistral';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { documentId } = await req.json();
  const supabase = createClient();

  const { data: doc } = await supabase
    .from('documents').select('*').eq('id', documentId).single();

  const { data: { signedUrl } } = await supabase.storage
    .from('documents').createSignedUrl(doc.storage_path, 60);

  await supabase.from('documents')
    .update({ status: 'processing' }).eq('id', documentId);

  const { pages, fields } = await extractDocument(signedUrl);

  const { data: extraction } = await supabase
    .from('extractions')
    .insert({ document_id: documentId, raw_mistral_response: { pages }, extracted_fields: fields })
    .select().single();

  await supabase.from('documents')
    .update({ status: 'done' }).eq('id', documentId);

  return NextResponse.json({ extractionId: extraction.id, fields });
}
```

---

## PDF Viewer + BBox Overlay (`components/PDFViewer.tsx`)

- Render each PDF page as a static image (convert server-side with `pdf2pic` or similar)
- Overlay an absolutely-positioned `<div>` acting as the highlight layer
- On `onFieldHover(fieldName)`, read the bbox from extraction data and render the highlight + confidence tag
- On `onFieldBlur()`, remove the highlight
- BBox coordinates from Mistral are normalized (0–1) — multiply by rendered image dimensions to get pixel positions

```typescript
interface BBox {
  page: number;
  x: number;        // normalized 0–1
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface PDFViewerProps {
  pageImages: string[];      // one URL per page
  activeBBox: BBox | null;
  activeFieldLabel: string;
}
```

Highlight style: `--navy` border, `rgba(30,58,95,0.08)` fill, confidence tag with `--navy` background.

---

## Sample Batch Logic

```typescript
const SAMPLE_DOCS = [
  '01-clinical-progress-note.pdf',
  '02-referral-letter.pdf',
  '03-insurance-card.pdf',
  '04-lab-results.pdf',
  '05-patient-intake-form.pdf',
  '06-handwritten-clinical-note.pdf',
  '07-service-request-form.pdf',
];

async function runSampleBatch() {
  // 1. Upload all 7 files to Supabase Storage
  // 2. Insert document rows with status 'pending' — list updates immediately
  // 3. Fire all extract calls in parallel
  await Promise.all(SAMPLE_DOCS.map(name => triggerExtract(name)));
}
```

Rows appear in the dashboard list as `processing` immediately. Status updates to `done` as each extraction completes. No separate batch page.

---

## Accuracy Dashboard Query

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

Display: three stat cards (total fields, approval rate, corrected count) + table with a correction rate bar per field. Bar color is `--navy` throughout — no red/yellow semantic colors in this view.

---

## Auth

Supabase Auth, email + password only.

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/ssr';

export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session && !req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## Key Decisions

1. **Mistral OCR 3 does everything in one call** — OCR, layout, bboxes, and structured field extraction via `document_annotation`. No second model.
2. **PDF rendered as images** — works equally for digital PDFs, scans, and handwritten notes. No text-layer dependency.
3. **No rejected state** — simplifies the review flow. Users approve or leave neutral. Keeping the binary reduces cognitive load.
4. **Confidence shown only on hover in PDF panel** — keeps the form clean. The number appears only when the user is actively looking at where the data came from.
5. **Inline editable inputs** — no separate edit mode. The field is always editable; clicking the check button approves whatever value is in the input.
6. **`was_edited` flag** — tracks whether the user changed the value before approving, without needing a separate "corrected" state in the UI. Powers the accuracy dashboard.
7. **Batch lives in the dashboard** — no separate route. Processing docs appear in the list in real time.
8. **Brand colors from getsolum.com** — navy `#1E3A5F` as the primary, matched to their `meta-theme-color`. Green reserved for approved state only.

---

## What to Improve with More Time

- Server-side PDF-to-image conversion (`pdf2pic`) for precise page rendering
- Supabase Realtime subscription for live status updates during batch
- Export approved form as a filled PDF
- Drag-and-drop upload zone
- Fine-tune Mistral bbox coordinates for inline text fields specifically
