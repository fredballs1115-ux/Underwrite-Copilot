-- ============================================================================
-- Underwrite Copilot — migration 0005: subscription billing
--
-- Adds Stripe subscription state to each profile. The free tier is capped at
-- a few deals; Pro ($79/mo) unlocks the model generator, the PDF memo, and the
-- public-web comp search. Billing logic lives server-side; this just stores
-- the synced state from Stripe webhooks.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz;
