-- 0011 — user-entered property address (structured, from the address
-- autocomplete on the new-deal form). Powers the buy-box geography check
-- from the moment of upload, before the OM extraction has even run.

alter table public.deals add column if not exists address jsonb;
