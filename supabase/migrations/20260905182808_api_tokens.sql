-- Tokens for the MCP server, and the bookkeeping that lets an agent write
-- entries without creating duplicates.

-- ---------------------------------------------------------------------------
-- Where an entry came from, and how to recognise it again
-- ---------------------------------------------------------------------------

alter table public.entries
  add column source text not null default 'app'
    check (source in ('app', 'api')),
  add column external_ref text
    check (external_ref is null or length(btrim(external_ref)) between 1 and 200);

-- An agent that photographs the same receipt twice should not book it twice.
-- The caller supplies a stable reference and the second attempt collides here.
create unique index entries_user_external_ref_key
  on public.entries (user_id, external_ref)
  where external_ref is not null;

-- ---------------------------------------------------------------------------
-- Moving a subcategory between macro categories
-- ---------------------------------------------------------------------------

-- entries carries (subcategory_id, category_id) so that a subcategory can only
-- ever be used inside the macro category it belongs to. That guarantee makes a
-- move impossible one statement at a time: updating subcategories first breaks
-- the rows in entries, and updating entries first points them at a pairing that
-- does not exist yet.
--
-- Making the constraint deferrable resolves it. It stays INITIALLY IMMEDIATE,
-- so every ordinary write is still checked the moment it happens; only a
-- transaction that explicitly defers it gets to pass through an inconsistent
-- middle, and the check still has to pass before commit.
alter table public.entries
  drop constraint entries_subcategory_id_category_id_fkey;

alter table public.entries
  add constraint entries_subcategory_id_category_id_fkey
    foreign key (subcategory_id, category_id)
    references public.subcategories (id, category_id)
    on delete restrict
    deferrable initially immediate;

-- ---------------------------------------------------------------------------
-- api_tokens
-- ---------------------------------------------------------------------------

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- Only the hash is stored. A leaked database row cannot be replayed as a
  -- token, and the plaintext is shown to the owner exactly once, at creation.
  token_hash text not null unique,
  -- The first characters, so the owner can tell two tokens apart in the list.
  prefix text not null check (length(prefix) between 4 and 16),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_tokens_user_idx on public.api_tokens (user_id, created_at desc);

alter table public.api_tokens enable row level security;

revoke all on public.api_tokens from anon, authenticated;
grant select, insert, update, delete on public.api_tokens to authenticated;

create policy "api tokens are readable by their owner"
  on public.api_tokens for select to authenticated
  using (user_id = (select auth.uid()));

create policy "api tokens are insertable by their owner"
  on public.api_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Update exists so a token can be revoked; the hash is never meant to change.
create policy "api tokens are updatable by their owner"
  on public.api_tokens for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "api tokens are deletable by their owner"
  on public.api_tokens for delete to authenticated
  using (user_id = (select auth.uid()));
