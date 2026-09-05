-- Row level security.
--
-- Julius is meant to be self-hosted and open source: the anon key ships to the
-- browser by design, so RLS is the only thing standing between one user's data
-- and another's. Every table is locked down, with no exceptions and no
-- permissive fallback policy.

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.entries enable row level security;
alter table public.investments enable row level security;
alter table public.investment_snapshots enable row level security;

-- Nothing here is reachable without a session, so the anon role gets nothing.
revoke all on public.profiles from anon;
revoke all on public.accounts from anon;
revoke all on public.categories from anon;
revoke all on public.subcategories from anon;
revoke all on public.entries from anon;
revoke all on public.investments from anon;
revoke all on public.investment_snapshots from anon;

-- profiles ------------------------------------------------------------------

create policy "profiles are readable by their owner"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles are updatable by their owner"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- accounts ------------------------------------------------------------------

create policy "accounts are readable by their owner"
  on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "accounts are insertable by their owner"
  on public.accounts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "accounts are updatable by their owner"
  on public.accounts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "accounts are deletable by their owner"
  on public.accounts for delete to authenticated
  using (user_id = (select auth.uid()));

-- categories ----------------------------------------------------------------

create policy "categories are readable by their owner"
  on public.categories for select to authenticated
  using (user_id = (select auth.uid()));

create policy "categories are insertable by their owner"
  on public.categories for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "categories are updatable by their owner"
  on public.categories for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "categories are deletable by their owner"
  on public.categories for delete to authenticated
  using (user_id = (select auth.uid()));

-- subcategories -------------------------------------------------------------

create policy "subcategories are readable by their owner"
  on public.subcategories for select to authenticated
  using (user_id = (select auth.uid()));

create policy "subcategories are insertable by their owner"
  on public.subcategories for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "subcategories are updatable by their owner"
  on public.subcategories for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "subcategories are deletable by their owner"
  on public.subcategories for delete to authenticated
  using (user_id = (select auth.uid()));

-- entries -------------------------------------------------------------------

create policy "entries are readable by their owner"
  on public.entries for select to authenticated
  using (user_id = (select auth.uid()));

create policy "entries are insertable by their owner"
  on public.entries for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "entries are updatable by their owner"
  on public.entries for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "entries are deletable by their owner"
  on public.entries for delete to authenticated
  using (user_id = (select auth.uid()));

-- investments ---------------------------------------------------------------

create policy "investments are readable by their owner"
  on public.investments for select to authenticated
  using (user_id = (select auth.uid()));

create policy "investments are insertable by their owner"
  on public.investments for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "investments are updatable by their owner"
  on public.investments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "investments are deletable by their owner"
  on public.investments for delete to authenticated
  using (user_id = (select auth.uid()));

-- investment_snapshots ------------------------------------------------------
--
-- Snapshots are written by a trigger, never by the client: the history of what
-- a position was worth should not be rewritable from the browser.

create policy "investment snapshots are readable by their owner"
  on public.investment_snapshots for select to authenticated
  using (user_id = (select auth.uid()));

create policy "investment snapshots are deletable by their owner"
  on public.investment_snapshots for delete to authenticated
  using (user_id = (select auth.uid()));
