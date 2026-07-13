-- ============================================================================
-- 0022 — deal task assignments (Feature 7)
--
-- deal_tasks: the verdict's "next steps" (and any manual to-do) as real,
-- assignable tasks with owners and due dates. Anyone who can see the deal
-- can manage its tasks — assignment is display-level workflow, not a
-- permission boundary. Extends the decision-log into actual team workflow.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.deal_tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  -- SET NULL, not CASCADE: a teammate deleting their account must not take
  -- the team's open tasks down with them (mirrors how notes keep their text).
  created_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  assignee_user_id uuid references auth.users (id) on delete set null,
  due_date date,
  done boolean not null default false,
  completed_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'verdict')),
  created_at timestamptz not null default now()
);

create index if not exists deal_tasks_deal_idx
  on public.deal_tasks (deal_id, created_at);

alter table public.deal_tasks enable row level security;

-- The deal-access predicate appears in EVERY policy — Postgres does not
-- apply USING to INSERT, so a single "for all" policy would let any
-- authenticated user who learned a deal id write tasks onto it straight
-- through PostgREST (same reasoning as deal_shares in 0017).
drop policy if exists "read deal tasks" on public.deal_tasks;
drop policy if exists "create deal tasks" on public.deal_tasks;
drop policy if exists "update deal tasks" on public.deal_tasks;
drop policy if exists "delete deal tasks" on public.deal_tasks;

create policy "read deal tasks" on public.deal_tasks
  for select using (public.can_access_deal(deal_id));

create policy "create deal tasks" on public.deal_tasks
  for insert with check (
    auth.uid() = created_by and public.can_access_deal(deal_id)
  );

create policy "update deal tasks" on public.deal_tasks
  for update using (public.can_access_deal(deal_id))
  with check (public.can_access_deal(deal_id));

create policy "delete deal tasks" on public.deal_tasks
  for delete using (public.can_access_deal(deal_id));
