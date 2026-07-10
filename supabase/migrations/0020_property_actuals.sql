-- ============================================================================
-- 0020 — property actuals: structured rent roll + T-12 extractions (Feature 1)
--
-- One row per uploaded rent roll / T-12, holding the STRUCTURED extraction
-- (raw rows + page refs) plus the DETERMINISTIC consolidated summary (unit mix,
-- lease-expiry buckets, WALT, weighted rent PSF for rent rolls; the normalized
-- operating statement + NOI for T-12s). Written server-side by the analysis
-- pipeline (service role) after a screen; read in the app to render the
-- PROPERTY ACTUALS card and to feed the underwriting model. Deals screened
-- before this table simply have no rows — the card is absent, never faked.
--
--   source_document_id  FK to the deal_documents row the extraction came from
--   as_of_date /        the rent roll's "as of" / the T-12's period-end date,
--   period_end_date     as extracted ("" when absent)
--   extraction          jsonb: the raw structured extraction + page locators
--   summary             jsonb: the code-derived analytics (never LLM math)
-- ============================================================================

create table if not exists public.deal_rent_rolls (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  source_document_id uuid references public.deal_documents (id) on delete set null,
  as_of_date text,
  extraction jsonb not null,
  summary jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.deal_t12_statements (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  source_document_id uuid references public.deal_documents (id) on delete set null,
  period_end_date text,
  extraction jsonb not null,
  summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deal_rent_rolls_deal_idx on public.deal_rent_rolls (deal_id);
create index if not exists deal_t12_statements_deal_idx on public.deal_t12_statements (deal_id);

alter table public.deal_rent_rolls enable row level security;
alter table public.deal_t12_statements enable row level security;

-- Read-only in the app: owners and teammates who can see the deal. Writes are
-- server-side (the service role bypasses RLS), so there is deliberately no user
-- insert/update/delete policy — the pipeline is the only author.
drop policy if exists "read own deal rent rolls" on public.deal_rent_rolls;
create policy "read own deal rent rolls" on public.deal_rent_rolls
  for select using (public.can_access_deal(deal_id));

drop policy if exists "read own deal t12 statements" on public.deal_t12_statements;
create policy "read own deal t12 statements" on public.deal_t12_statements
  for select using (public.can_access_deal(deal_id));
