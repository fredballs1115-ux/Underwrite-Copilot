-- ============================================================================
-- 0031 — valuations (Phase 2: BOV Reconciler)
--
-- Two brokers value the same asset and the numbers don't match. This table
-- holds each opinion of value as a comparable assumption set — one row per BOV,
-- per seller guidance sheet, and one for the user's own underwriting — so the
-- gap between any two of them can be decomposed instead of argued about.
--
-- Every numeric column is NULLABLE ON PURPOSE. A BOV that doesn't state a
-- vacancy assumption has no vacancy assumption; writing 0 there would be a
-- fabrication that quietly changes the answer. Null means "not stated".
--
-- `citations` holds a per-field page reference from the extraction pass
-- ({ field: { page, snippet } }) so every extracted number links back to the
-- page it was read from. `derived_fields` names the fields the extractor
-- COMPUTED rather than read (a cap rate backed out of a value and an NOI), so
-- the UI can label them distinctly from stated ones.
-- ============================================================================

create table if not exists public.valuations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'JLL BOV', 'Eastdil BOV', 'Our UW'
  source_label text not null,
  source_type text not null check (source_type in ('broker', 'internal', 'seller')),

  headline_value numeric,
  year1_noi numeric,
  -- decimals, matching the underwriting engine's convention (0.065 = 6.5%)
  going_in_cap numeric,
  exit_cap numeric,
  hold_years int,
  rent_growth numeric,
  vacancy_assumption numeric,
  -- TI/LC, deferred maintenance, credits — anything deducted below the line
  capex_deduction numeric,
  discount_rate numeric,

  source_document_id uuid references public.deal_documents (id) on delete set null,
  -- true when pulled from a PDF, false when typed by the user
  extracted boolean not null default false,
  citations jsonb not null default '{}'::jsonb,
  derived_fields jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists valuations_deal_idx on public.valuations (deal_id, created_at);

alter table public.valuations enable row level security;

-- Owner-only, widened to teammates by the shared deal predicate. USING does
-- not apply to INSERT, so each verb carries its own policy.
drop policy if exists "own valuations" on public.valuations;
drop policy if exists "read own valuations" on public.valuations;
drop policy if exists "create own valuations" on public.valuations;
drop policy if exists "update own valuations" on public.valuations;
drop policy if exists "delete own valuations" on public.valuations;

create policy "read own valuations" on public.valuations
  for select using (public.can_access_deal(deal_id));

create policy "create own valuations" on public.valuations
  for insert with check (
    auth.uid() = user_id and public.can_access_deal(deal_id)
  );

create policy "update own valuations" on public.valuations
  for update using (public.can_access_deal(deal_id))
  with check (public.can_access_deal(deal_id));

create policy "delete own valuations" on public.valuations
  for delete using (public.can_access_deal(deal_id));
