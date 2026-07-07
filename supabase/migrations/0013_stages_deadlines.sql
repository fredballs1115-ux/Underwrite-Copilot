-- Underwrite Copilot — migration 0013: full deal-stage ladder + stage history
-- + call-for-offers deadlines.
--
--   1. Widen deals.stage from the original four values to the seven-stage
--      acquisitions ladder. Existing data is MAPPED, never wiped:
--         screening  → screening        (unchanged)
--         reviewing  → tracking         (same meaning, new name)
--         pursuing   → active_pursuit   (same meaning, new name)
--         dead       → dead             (unchanged)
--      New uploads keep defaulting to 'screening'. No other columns are read
--      or written, so no deal data is lost.
--   2. deals.stage_history — an append-only jsonb log [{stage, at}] written by
--      the app whenever the stage changes.
--   3. deals.offers_due — the broker's call-for-offers date, for deadline
--      urgency in the pipeline.

-- 1. Stage ladder --------------------------------------------------------------
alter table public.deals drop constraint if exists deals_stage_check;

update public.deals set stage = 'tracking'       where stage = 'reviewing';
update public.deals set stage = 'active_pursuit' where stage = 'pursuing';
update public.deals set stage = 'screening'      where stage is null;

alter table public.deals add constraint deals_stage_check
  check (stage in (
    'screening',
    'tracking',
    'active_pursuit',
    'loi_submitted',
    'under_contract',
    'closed',
    'dead'
  ));

-- 2. Stage history --------------------------------------------------------------
alter table public.deals
  add column if not exists stage_history jsonb not null default '[]'::jsonb;

-- 3. Call-for-offers deadline ---------------------------------------------------
alter table public.deals
  add column if not exists offers_due date;
