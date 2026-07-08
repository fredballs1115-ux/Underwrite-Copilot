-- ============================================================================
-- 0018 — deal_facts: citation-level provenance for every extracted number
--
-- One row per extracted / derived / defaulted figure, with where it came from.
-- Written server-side by the analysis pipeline (service role) after each
-- screen; read in the app to render source chips. Deals screened before this
-- table simply have no rows — the UI shows no chips rather than faking them.
--
--   field           canonical label, e.g. "Going-in cap rate"
--   value           the figure as shown, e.g. "6.0%"
--   unit            "%", "$", "$/unit", "SF", "x", "" (derived from value)
--   doc_label       which document, e.g. "OM", "Rent roll", "T-12"
--   doc_id          optional FK to deal_documents (null for the OM itself)
--   page_number     1-based page; NULL when the figure isn't on a page
--   located         false => "source not located" (page out of range/absent)
--   locator_snippet <= ~10 words of surrounding text, for the hover
--   confidence      high | medium | low
--   provenance      extracted | derived | assumption
-- ============================================================================

create table if not exists public.deal_facts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  field text not null,
  value text not null,
  unit text,
  doc_label text not null default 'OM',
  doc_id uuid references public.deal_documents (id) on delete set null,
  page_number int,
  located boolean not null default true,
  locator_snippet text,
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  provenance text not null default 'extracted'
    check (provenance in ('extracted', 'derived', 'assumption')),
  created_at timestamptz not null default now()
);

create index if not exists deal_facts_deal_idx on public.deal_facts (deal_id);

alter table public.deal_facts enable row level security;

-- Read-only in the app: owners and teammates who can see the deal. Writes are
-- server-side (service role bypasses RLS), so there is deliberately no user
-- insert/update/delete policy — the pipeline is the only author.
drop policy if exists "read own deal facts" on public.deal_facts;
create policy "read own deal facts" on public.deal_facts
  for select using (public.can_access_deal(deal_id));
