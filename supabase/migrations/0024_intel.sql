-- ============================================================================
-- 0024 — daily market intel (research build, Phase 2 item 5)
--
-- market_intel_items   — every news item the daily job has seen (dedupe on
--                        url), with Claude's 0-10 relevance score + summary.
-- market_intel_digests — one markdown digest per weekday run.
--
-- The daily job (scripts/daily-intel.mjs, Render cron) writes with the
-- service role; signed-in users read. Alerts the job derives from likely
-- law/regulation changes land in regulatory_alerts (0023) and render as a
-- red banner until dismissed.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.market_intel_items (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  source text,
  sector text,                 -- which watch query surfaced it
  published_at timestamptz,
  relevance int check (relevance between 0 and 10),
  summary text,
  action text,                 -- the "so what" for the buyer, when Claude finds one
  created_at timestamptz not null default now()
);

create index if not exists market_intel_items_created_idx
  on public.market_intel_items (created_at desc);

create table if not exists public.market_intel_digests (
  id uuid primary key default gen_random_uuid(),
  digest_date date not null unique,
  markdown text not null,
  item_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.market_intel_items enable row level security;
alter table public.market_intel_digests enable row level security;

drop policy if exists "read intel items" on public.market_intel_items;
create policy "read intel items" on public.market_intel_items
  for select to authenticated using (true);

drop policy if exists "read intel digests" on public.market_intel_digests;
create policy "read intel digests" on public.market_intel_digests
  for select to authenticated using (true);
