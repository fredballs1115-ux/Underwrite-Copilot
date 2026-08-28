-- ============================================================================
-- 0030 — deal versions + assumption-bridge cache (Phase 1: Assumption Bridge)
--
-- A "version" is one immutable snapshot of the underwriting engine's INPUT set
-- (lib/underwrite/engine.ts -> UnderwriteInputs) together with the RESULT that
-- input set produced. Snapshots are taken automatically whenever a deal's
-- derived assumptions change, and manually when the user saves a scenario off
-- the sensitivity playground ('broker case', 'v2 after retrade', ...).
--
-- The bridge between any two versions is pure math over those two jsonb blobs,
-- so it is cached rather than recomputed: reopening a deal is instant.
-- ============================================================================

create table if not exists public.deal_versions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'v1', 'v2', 'broker case' — unique per deal so labels stay addressable
  version_label text not null,
  note text,
  -- the full UnderwriteInputs object
  assumptions jsonb not null,
  -- irr, multiple, cash flows, sources & uses, residual
  results jsonb not null,
  -- true when the pipeline snapshotted it, false when the user saved it
  automatic boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists deal_versions_deal_created_idx
  on public.deal_versions (deal_id, created_at desc);

create unique index if not exists deal_versions_deal_label_idx
  on public.deal_versions (deal_id, version_label);

alter table public.deal_versions enable row level security;

-- Owner-only, widened to teammates by the shared predicate the other deal-child
-- tables use. USING does not apply to INSERT, so every verb gets its own policy.
drop policy if exists "own deal versions" on public.deal_versions;
drop policy if exists "read own deal versions" on public.deal_versions;
drop policy if exists "create own deal versions" on public.deal_versions;
drop policy if exists "delete own deal versions" on public.deal_versions;

create policy "read own deal versions" on public.deal_versions
  for select using (public.can_access_deal(deal_id));

create policy "create own deal versions" on public.deal_versions
  for insert with check (
    auth.uid() = user_id and public.can_access_deal(deal_id)
  );

create policy "delete own deal versions" on public.deal_versions
  for delete using (public.can_access_deal(deal_id));

-- Versions are immutable by design: an audit trail you can edit is not one.
-- (No update policy — PostgREST will reject an UPDATE outright.)

-- ---------------------------------------------------------------------------
-- Cached bridges. Keyed on the ordered version pair; a version's deletion
-- cascades its bridges away.
-- ---------------------------------------------------------------------------
create table if not exists public.deal_version_bridges (
  from_version_id uuid not null references public.deal_versions (id) on delete cascade,
  to_version_id uuid not null references public.deal_versions (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  bridge jsonb not null,
  created_at timestamptz not null default now(),
  primary key (from_version_id, to_version_id)
);

create index if not exists deal_version_bridges_deal_idx
  on public.deal_version_bridges (deal_id);

alter table public.deal_version_bridges enable row level security;

drop policy if exists "read own version bridges" on public.deal_version_bridges;
drop policy if exists "create own version bridges" on public.deal_version_bridges;

create policy "read own version bridges" on public.deal_version_bridges
  for select using (public.can_access_deal(deal_id));

create policy "create own version bridges" on public.deal_version_bridges
  for insert with check (public.can_access_deal(deal_id));
