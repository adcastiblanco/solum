-- Solum Health — Document AI MVP — initial schema
-- Tables: documents, extractions, field_reviews
-- Adds the error_message column on documents per PRD.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  status text default 'pending', -- pending | processing | done | error
  error_message text,
  created_at timestamptz default now()
);

create table if not exists extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  raw_mistral_response jsonb,
  extracted_fields jsonb,
  created_at timestamptz default now()
);

create table if not exists field_reviews (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid references extractions(id) on delete cascade,
  field_name text not null,
  original_value text,
  final_value text,
  was_edited boolean default false,
  approved boolean default false,
  confidence numeric,
  bbox jsonb,
  reviewed_at timestamptz default now(),
  unique (extraction_id, field_name)
);

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

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Users upload own files" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users read own files" on storage.objects
  for select using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
