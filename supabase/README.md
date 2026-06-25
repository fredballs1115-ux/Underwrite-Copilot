# Supabase

Supabase gives us three things in one tool: a Postgres **database** (deals,
jobs), user **Auth** (login), and **Storage** (the uploaded OM PDFs).

## Setup

1. Create a project at https://supabase.com.
2. From **Project Settings → API**, copy the Project URL and the `anon` and
   `service_role` keys into your `.env.local` (see `.env.example` at the repo root).
3. Apply the schema: open the **SQL Editor** in the dashboard and run the files
   in `migrations/` in order (or use the Supabase CLI).

## Storage (Phase 2)

Create a **private** bucket named `offering-memoranda` (Storage → New bucket,
with "Public" turned OFF). OM PDFs are stored per user, and access policies make
sure a user can only read their own files.
