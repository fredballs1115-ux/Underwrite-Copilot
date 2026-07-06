-- ============================================================================
-- Underwrite Copilot — migration 0003: multi-document model generator
--
-- Adds a per-deal document set (OM, rent roll, T-12, financials, loan terms,
-- other) and a `model` column to hold the generated first-draft underwriting
-- model (reconciled assumptions, conflicts, cash flow, and returns).
--
-- Idempotent: safe to run again. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

-- Source documents attached to a deal.
create table if not exists public.deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  -- 'om' | 'rent_roll' | 't12' | 'financials' | 'loan_terms' | 'other'
  kind text not null default 'other',
  filename text not null,
  storage_path text not null,
  content_type text,
  created_at timestamptz not null default now()
);

alter table public.deal_documents enable row level security;

drop policy if exists "own deal documents" on public.deal_documents;
create policy "own deal documents" on public.deal_documents
  for all using (
    exists (
      select 1 from public.deals d
      where d.id = deal_documents.deal_id and d.user_id = auth.uid()
    )
  );

-- The generated first-draft model (see lib/model/types.ts -> UnderwritingModel).
alter table public.deals
  add column if not exists model jsonb;

-- The analysis_jobs.step set now also includes 'model'. Documents live in the
-- existing private 'offering-memoranda' bucket under documents/<deal_id>/...
