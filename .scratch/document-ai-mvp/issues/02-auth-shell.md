# 02 — Auth shell + empty dashboard

Status: ready-for-agent

## Parent

`.scratch/document-ai-mvp/PRD.md`

## What to build

Email + password auth via Supabase. Signup, login, logout, and a session-aware middleware that redirects unauthenticated users to `/login`. Land authenticated users on `/dashboard` which renders an empty state plus the persistent nav (logo, links to Dashboard + Accuracy, logout button). No upload yet.

## Acceptance criteria

- [ ] `/signup` accepts email + password, creates a Supabase Auth user, logs in, redirects to `/dashboard`
- [ ] `/login` authenticates an existing user and redirects to `/dashboard`
- [ ] Logout button in the nav signs the user out and redirects to `/login`
- [ ] Middleware uses `createServerClient` from `@supabase/ssr` (not the doc's incorrect `createMiddlewareClient`) and redirects any non-auth route to `/login` when there is no session
- [ ] `/dashboard` shows an empty-state message and the nav while no documents exist
- [ ] Two browser tabs with different users see no shared state — RLS is in effect
- [ ] Nav uses `--navy` background, logo in `Instrument Serif`, no emojis

## Blocked by

- 01-bootstrap
