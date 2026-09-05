-- Table level privileges, declared explicitly.
--
-- Two reasons not to inherit whatever the platform's default privileges happen
-- to be. First, they were wrong here: `authenticated` ended up with TRUNCATE,
-- REFERENCES, TRIGGER and MAINTAIN but without SELECT/INSERT/UPDATE/DELETE, so
-- the app could not read its own tables. Second, TRUNCATE is not filtered by
-- row level security -- a signed in user holding it could empty a table
-- including every other user's rows, straight through PostgREST.
--
-- Second reason to be explicit: this project is meant to be self-hosted, and
-- the next person's Supabase may not default the same way.

-- Start from nothing, so the grants below are the whole story.
revoke all on public.profiles from anon, authenticated;
revoke all on public.accounts from anon, authenticated;
revoke all on public.categories from anon, authenticated;
revoke all on public.subcategories from anon, authenticated;
revoke all on public.entries from anon, authenticated;
revoke all on public.investments from anon, authenticated;
revoke all on public.investment_snapshots from anon, authenticated;
revoke all on public.account_balances from anon, authenticated;

-- Signed out visitors reach none of this.
-- (nothing granted to anon, by design)

-- A profile row is created by the signup trigger and deleted with the account,
-- so the owner may read and edit it but never insert or remove one.
grant select, update on public.profiles to authenticated;

grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.subcategories to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.investments to authenticated;

-- Snapshots are append-only history written by a trigger. The owner can read
-- them and drop them, but cannot forge one.
grant select, delete on public.investment_snapshots to authenticated;

grant select on public.account_balances to authenticated;

-- Same reasoning for anything added later in this schema: grant deliberately,
-- and never hand out TRUNCATE.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
