# 01 — Project bootstrap

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

Scaffold the Next.js 14 (App Router, TypeScript, Tailwind) project, install required dependencies, set up env var conventions, and commit the Supabase schema as a versioned migration file. No auth, no UI beyond the default Next.js homepage yet — this slice exists to give every subsequent slice a working app to build on.

## Acceptance criteria

- [ ] Next.js 14 scaffolded **into the current repo root** (not a subdirectory). Use a non-interactive invocation, e.g. `npx create-next-app@latest . --typescript --tailwind --app --eslint --use-npm --no-src-dir --import-alias "@/*" --yes`. If `create-next-app` complains the directory is not empty, scaffold into a tempdir and copy files in, preserving `.git/`, `.scratch/`, `docs/`, `supabase/`, `files/`, `afk-ralph.sh`, `CLAUDE.md`, `.env.local`, `.env.local.example`, `.gitignore`.
- [ ] Installed: `@mistralai/mistralai`, `@supabase/supabase-js`, `@supabase/ssr`, `geist`, `react-pdf`
- [ ] `.env.local.example` lists `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MISTRAL_API_KEY`
- [ ] `.env.local` is gitignored
- [ ] `supabase/migrations/0001_init.sql` contains: `documents` (with `error_message text`), `extractions`, `field_reviews` tables; RLS policies; the `documents` storage bucket + policies. Schema matches `docs/solum-implementation.md` plus the `error_message` column from the PRD.
- [ ] Design tokens from `docs/solum-implementation.md` (colors, fonts, spacing/radius) are wired into `app/globals.css` as CSS custom properties
- [ ] Fonts: `Geist` via the `geist` npm package; `Instrument Serif` and `Geist Mono` via Google Fonts in `app/layout.tsx`
- [ ] `npm run dev` boots without errors and serves a page using the `--canvas` background and `Instrument Serif` title

## Blocked by

None — can start immediately.
