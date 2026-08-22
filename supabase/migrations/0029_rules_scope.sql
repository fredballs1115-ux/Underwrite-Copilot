-- ============================================================================
-- 0029 — enforce the 15-market scope in the DATABASE rule set.
--
-- The product's coverage was cut to 15 markets (14 jurisdictions). The seed
-- files were trimmed, but the seeder only UPSERTS — a database seeded before
-- the cut still carries the removed states' rules, and the app unions DB
-- rows over seeds, so a Denver or St. Paul deal would keep showing rules the
-- product no longer claims. This migration deletes every regulatory rule
-- whose id is not in the covered set (their red-banner alerts cascade via
-- the existing ON DELETE CASCADE). Rows are recoverable from git history if
-- a market is ever re-added.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

delete from public.regulatory_rules
where id not in (
  'ca-ab1482-rent-cap',
  'ca-la-rso-coverage',
  'ca-sf-rent-ordinance',
  'dc-rent-stab-coverage',
  'dc-rent-stab-small-landlord-exemption',
  'dc-rental-act-law-26-80',
  'dc-topa-2-4-unit-exemption',
  'dc-topa-sale-trigger',
  'dc-vacant-property-tax',
  'de-no-rent-control',
  'fl-rent-control-preemption',
  'ga-rent-control-preemption',
  'il-chicago-rlto-owner-occupied-exemption',
  'il-rent-control-preemption',
  'ma-rent-control-ban',
  'md-baltimore-rental-license',
  'md-moco-rent-stabilization',
  'md-pg-prsa-cap',
  'md-pg-prsa-small-landlord-exemption',
  'md-takoma-park-rent-stabilization',
  'nj-jersey-city-rent-control',
  'nj-municipal-rent-control',
  'nj-newark-rent-control',
  'ny-good-cause-eviction',
  'ny-nyc-rent-stabilization-coverage',
  'pa-philadelphia-eviction-diversion',
  'tx-rent-control-preemption',
  'va-no-local-rent-control',
  'wa-rent-cap-hb1217'
);
