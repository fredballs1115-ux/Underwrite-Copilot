-- 0014: per-user email notification preference.
--
-- One boolean on profiles: does this user want an email when an analysis
-- finishes? ON by default (and the app treats a missing column as ON, so
-- deploying the code before this migration is safe). Written only via the
-- service role from the account settings action — the migration-0008 column
-- grants for user-context reads stay untouched.

alter table public.profiles
  add column if not exists email_on_analysis boolean not null default true;

comment on column public.profiles.email_on_analysis is
  'Send an email when a deal analysis completes (Resend). Default on.';
