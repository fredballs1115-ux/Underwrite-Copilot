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

-- Updates may edit the WORK (title, assignee, due date, done state) but
-- never the record's identity — a task can't be repointed to another deal,
-- re-attributed to another creator, or re-badged as verdict-sourced through
-- raw PostgREST (same guard pattern as deal_shares in 0017).
create or replace function public.deal_tasks_guard()
returns trigger
language plpgsql
as $$
begin
  if new.deal_id is distinct from old.deal_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.source is distinct from old.source then
    raise exception 'task identity fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists deal_tasks_guard on public.deal_tasks;
create trigger deal_tasks_guard before update on public.deal_tasks
  for each row execute function public.deal_tasks_guard();
